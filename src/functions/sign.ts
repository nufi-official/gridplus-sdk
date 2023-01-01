import { sha256 } from 'hash.js';
import bitcoin from '../bitcoin';
import { 
  CURRENCIES, 
} from '../constants';
import ethereum from '../ethereum';
import { 
  parseGenericSigningResponse 
} from '../genericSigning';
import {
  encryptedSecureRequest,
  LatticeSecureEncryptedRequestType,
  LatticeSignSchema,
} from '../protocol';
import {
  buildTransaction,
  request
} from '../shared/functions';
import {
  validateConnectedClient,
} from '../shared/validators';
import { parseDER } from '../util';

/**
 * `sign` builds and sends a request for signing to the device.
 * @category Lattice
 * @returns The response from the device.
 */
export async function sign (
  req: SignRequestFunctionParams
): Promise<SignData> {
  // Validate request params
  validateSignRequest(req);

  // Build the transaction request
  const { request: requestData, isGeneric } = buildTransaction({
    data: req.data,
    currency: req.currency,
    fwConstants: req.client.getFwConstants(),
  });
  // Build data for this request
  const { payload: data, hasExtraPayloads } = encodeSignRequest({
    client: req.client,
    request: requestData,
    cachedData: req.cachedData,
    nextCode: req.nextCode,
  });
  // Make the request
  const decRespPayloadData = await encryptedSecureRequest(
    req.client,
    data,
    LatticeSecureEncryptedRequestType.sign
  );
  // If this request has multiple payloads, we need to recurse
  // so that we can make the next request.
  // It is chained to the first request using `nextCode`
  if (hasExtraPayloads) {
    req.cachedData = requestData;
    req.nextCode = decRespPayloadData.slice(0, 8);
    return await sign(req);
  }
  // If this is the only (or final) request,
  // decode response data and return
  return decodeSignResponse({
    data: decRespPayloadData,
    request: requestData,
    isGeneric,
    currency: req.currency,
  });
}

export const validateSignRequest = (
  req: SignRequestFunctionParams
) => {
  validateConnectedClient(req.client);
  // Build the transaction request. An error will be thrown
  // if the request cannot be built.
  buildTransaction({
    data: req.data,
    currency: req.currency,
    fwConstants: req.client.getFwConstants(),
  });
}

export const encodeSignRequest = ({
  client,
  request,
  cachedData,
  nextCode,
}: EncodeSignRequestParams) => {
  // Build payload data
  const fwConstants = client.getFwConstants();
  let reqPayload, schema;
  if (cachedData && nextCode) {
    request = cachedData;
    reqPayload = Buffer.concat([nextCode, request.extraDataPayloads.shift()]);
    schema = LatticeSignSchema.extraData;
  } else {
    reqPayload = request.payload;
    schema = request.schema;
  }

  const payload = Buffer.alloc(2 + fwConstants.reqMaxDataSz);
  let off = 0;

  const hasExtraPayloads =
    request.extraDataPayloads && Number(request.extraDataPayloads.length > 0);

  payload.writeUInt8(hasExtraPayloads, off);
  off += 1;
  // Copy request schema (e.g. ETH or BTC transfer)
  payload.writeUInt8(schema, off);
  off += 1;
  // Copy the wallet UID
  const wallet = client.getActiveWallet();
  wallet.uid?.copy(payload, off);
  off += wallet.uid?.length ?? 0;
  // Build data based on the type of request
  reqPayload.copy(payload, off);
  return { payload, hasExtraPayloads };
};

export const decodeSignResponse = ({
  data,
  request,
  isGeneric,
  currency,
}: DecodeSignResponseParams): SignData => {
  let off = 0;
  const derSigLen = 74; // DER signatures are 74 bytes
  if (currency === CURRENCIES.BTC) {
    const btcRequest = request as BitcoinSignRequest;
    const pkhLen = 20; // Pubkeyhashes are 20 bytes
    const sigsLen = 740; // Up to 10x DER signatures
    const changeVersion = bitcoin.getAddressFormat(btcRequest.origData.changePath);
    const changePubKeyHash = data.slice(off, off + pkhLen);
    off += pkhLen;
    const changeRecipient = bitcoin.getBitcoinAddress(
      changePubKeyHash,
      changeVersion,
    );
    const compressedPubLength = 33; // Size of compressed public key
    const pubkeys = [];
    const sigs = [];
    let n = 0;
    // Parse the signature for each output -- they are returned in the serialized payload in form
    // [pubkey, sig] There is one signature per output
    while (off < data.length) {
      // Exit out if we have seen all the returned sigs and pubkeys
      if (data[off] !== 0x30) break;
      // Otherwise grab another set Note that all DER sigs returned fill the maximum 74 byte
      // buffer, but also contain a length at off+1, which we use to parse the non-zero data.
      // First get the signature from its slot
      const sigStart = off;
      const sigEnd = off + 2 + data[off + 1];
      sigs.push(data.slice(sigStart, sigEnd));
      off += derSigLen;
      // Next, shift by the full set of signatures to hit the respective pubkey NOTE: The data
      // returned is: [<sig0>, <sig1>, ... <sig9>][<pubkey0>, <pubkey1>, ... <pubkey9>]
      const pubStart = n * compressedPubLength + sigsLen;
      const pubEnd = (n + 1) * compressedPubLength + sigsLen;
      pubkeys.push(data.slice(pubStart, pubEnd));
      // Update offset to hit the next signature slot
      n += 1;
    }
    // Build the transaction data to be serialized
    const preSerializedData: any = {
      inputs: [],
      outputs: [],
    };

    // First output comes from request dta
    preSerializedData.outputs.push({
      value: btcRequest.origData.value,
      recipient: btcRequest.origData.recipient,
    });
    if (btcRequest.changeData.value > 0) {
      // Second output comes from change data
      preSerializedData.outputs.push({
        value: btcRequest.changeData.value,
        recipient: changeRecipient,
      });
    }

    // Add the inputs
    for (let i = 0; i < sigs.length; i++) {
      preSerializedData.inputs.push({
        hash: btcRequest.origData.prevOuts[i].txHash,
        index: btcRequest.origData.prevOuts[i].index,
        sig: sigs[i],
        pubkey: pubkeys[i],
        signerPath: btcRequest.origData.prevOuts[i].signerPath,
      });
    }

    // Finally, serialize the transaction
    const serializedTx = bitcoin.serializeTx(preSerializedData);
    // Generate the transaction hash so the user can look this transaction up later
    const preImageTxHash = serializedTx;
    const txHashPre: Buffer = Buffer.from(
      sha256().update(Buffer.from(preImageTxHash, 'hex')).digest('hex'),
      'hex',
    );
    // Add extra data for debugging/lookup purposes
    return {
      tx: serializedTx,
      txHash: sha256().update(txHashPre).digest('hex'),
      changeRecipient,
      sigs,
    };
  } else if (currency === CURRENCIES.ETH && !isGeneric) {
    const sig = parseDER(data.slice(off, off + 2 + data[off + 1]));
    off += derSigLen;
    const ethAddr = data.slice(off, off + 20);
    // Determine the `v` param and add it to the sig before returning
    const { rawTx, sigWithV } = ethereum.buildEthRawTx(request, sig, ethAddr);
    return {
      tx: `0x${rawTx}`,
      txHash: `0x${ethereum.hashTransaction(rawTx)}`,
      sig: {
        v: sigWithV.v,
        r: sigWithV.r.toString('hex'),
        s: sigWithV.s.toString('hex'),
      },
      signer: ethAddr,
    };
  } else if (currency === CURRENCIES.ETH_MSG) {
    const sig = parseDER(data.slice(off, off + 2 + data[off + 1]));
    off += derSigLen;
    const signer = data.slice(off, off + 20);
    const validatedSig = ethereum.validateEthereumMsgResponse(
      { signer, sig },
      request,
    );
    return {
      sig: {
        v: validatedSig.v,
        r: validatedSig.r.toString('hex'),
        s: validatedSig.s.toString('hex'),
      },
      signer,
    };
  } else {
    // Generic signing request
    return parseGenericSigningResponse(data, off, request);
  }
};