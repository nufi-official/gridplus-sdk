import { Chain, Common, Hardfork } from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import {
  addAddressTags,
  fetchAddresses,
  fetchAddressTags,
  fetchLedgerLiveAddresses,
  getClient,
  removeAddressTags,
  sign,
  signMessage,
} from 'gridplus-sdk';
import { useState } from 'react';
import { Button } from './Button';

export const Lattice = ({ label }) => {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [addressTags, setAddressTags] = useState<{ id: string }[]>([]);
  const [ledgerAddresses, setLedgerAddresses] = useState<any>([]);

  const getTxPayload = () => {
    const txData = {
      type: 1,
      maxFeePerGas: 1200000000,
      maxPriorityFeePerGas: 1200000000,
      nonce: 0,
      gasLimit: 50000,
      to: '0xe242e54155b1abc71fc118065270cecaaf8b7768',
      value: 1000000000000,
      data: '0x17e914679b7e160613be4f8c2d3203d236286d74eb9192f6d6f71b9118a42bb033ccd8e8',
      gasPrice: 1200000000,
    };
    const common = new Common({
      chain: Chain.Mainnet,
      hardfork: Hardfork.London,
    });
    const tx = TransactionFactory.fromTxData(txData, { common });
    const payload = tx.getMessageToSign(false);
    return payload;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        margin: '10px',
        padding: '25px',
        border: '1px solid black',
      }}
    >
      <h2>{label}</h2>
      <Button onClick={() => sign(getTxPayload())}>Sign</Button>
      <Button onClick={() => signMessage('test message')}>Sign Message</Button>
      <Button
        onClick={() =>
          getClient()
            .sign({
              currency: 'ETH_MSG',
              data: {
                signerPath: [2147483692, 2147483708, 2147483648, 0, 0],
                protocol: 'eip712',
                payload: {
                  types: {
                    EIP712Domain: [
                      {
                        name: 'name',
                        type: 'string',
                      },
                      {
                        name: 'version',
                        type: 'string',
                      },
                      {
                        name: 'chainId',
                        type: 'uint256',
                      },
                      {
                        name: 'verifyingContract',
                        type: 'address',
                      },
                    ],
                    Group: [
                      {
                        name: 'name',
                        type: 'string',
                      },
                      {
                        name: 'members',
                        type: 'Person[]',
                      },
                    ],
                    Mail: [
                      {
                        name: 'from',
                        type: 'Person',
                      },
                      {
                        name: 'to',
                        type: 'Person[]',
                      },
                      {
                        name: 'contents',
                        type: 'string',
                      },
                      {
                        name: 'attachment',
                        type: 'bytes',
                      },
                    ],
                    Person: [
                      {
                        name: 'name',
                        type: 'string',
                      },
                      {
                        name: 'wallets',
                        type: 'address[]',
                      },
                    ],
                  },
                  primaryType: 'Mail',
                  domain: {
                    chainId: '0xaa36a7',
                    name: 'Ether Mail',
                    verifyingContract:
                      '0xcccccccccccccccccccccccccccccccccccccccc',
                    version: '1',
                  },
                  message: {
                    contents: 'Hello, Bob!',
                    from: {
                      name: 'Cow',
                      wallets: [
                        '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826',
                        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
                      ],
                    },
                    to: [
                      {
                        name: 'Bob',
                        wallets: [
                          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                          '0xb0bdabea57b0bdabea57b0bdabea57b0bdabea57',
                          '0xb0b0b0b0b0b0b000000000000000000000000000',
                        ],
                      },
                    ],
                    attachment: '0x',
                  },
                },
              },
            })
            .then(console.log)
        }
      >
        Sign Debug
      </Button>

      <div>
        <h3>Addresses</h3>
        <ul>
          {addresses?.map((address) => (
            <li key={address}>{address}</li>
          ))}
        </ul>
      </div>
      <Button
        onClick={async () => {
          const addresses = await fetchAddresses();
          setAddresses(addresses);
        }}
      >
        Fetch Addresses
      </Button>
      <Button
        onClick={async () => {
          await addAddressTags([{ test: 'test' }]);
          const addressTags = await fetchAddressTags();
          setAddressTags(addressTags);
        }}
      >
        Add Address Tag
      </Button>
      <Button
        onClick={async () => {
          const fetchedAddressTags = await fetchAddressTags();
          setAddressTags(fetchedAddressTags);
        }}
      >
        Fetch Address Tags
      </Button>
      <Button
        onClick={async () => {
          await removeAddressTags(addressTags);
          const fetchedAddressTags = await fetchAddressTags();
          setAddressTags(fetchedAddressTags);
        }}
      >
        Remove Address Tags
      </Button>
      <div>
        <h3>Address Tags</h3>
        <ul>
          {addressTags?.map((tag: any) => (
            <li key={tag.key}>
              {tag.key}: {tag.val}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3>Ledger Addresses</h3>
        <ul>
          {ledgerAddresses?.map((ledgerAddress: any) => (
            <li key={ledgerAddress}>{ledgerAddress}</li>
          ))}
        </ul>
      </div>
      <Button
        onClick={async () => {
          const ledgerAddresses = await fetchLedgerLiveAddresses();
          setLedgerAddresses(ledgerAddresses);
        }}
      >
        Fetch Ledger Addresses
      </Button>
    </div>
  );
};
