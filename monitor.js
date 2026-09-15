import {
  createPublicClient,
  createWalletClient,
  http
} from 'viem'

import { privateKeyToAccount } from 'viem/accounts'

const RPC_URL = 'https://rpc.testnet.arc.io'

const NFT_CONTRACT = '0xf3716D3f62d7A972C2aC0A5b93914Da85eD915Aa'

const privateKey = process.env.PRIVATE_KEY

if (!privateKey) {
  throw new Error('PRIVATE_KEY is not set')
}

const account = privateKeyToAccount(privateKey)

const publicClient = createPublicClient({
  transport: http(RPC_URL)
})

const walletClient = createWalletClient({
  account,
  transport: http(RPC_URL)
})

const abi = [
  {
    type: 'function',
    name: 'publicMintOpen',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }]
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: []
  }
]

console.log('NFT Mint Bot Started')
console.log('Wallet:', account.address)
console.log('Contract:', NFT_CONTRACT)

while (true) {
  try {
    const isOpen = await publicClient.readContract({
      address: NFT_CONTRACT,
      abi,
      functionName: 'publicMintOpen'
    })

    console.log(
      new Date().toLocaleTimeString(),
      '| Public mint:',
      isOpen ? 'OPEN 🟢' : 'CLOSED 🔴'
    )

    if (isOpen) {
      console.log('🎉 Public mint detected!')
      console.log('Sending mint transaction...')

      const hash = await walletClient.writeContract({
        address: NFT_CONTRACT,
        abi,
        functionName: 'mint'
      })

      console.log('Transaction sent:', hash)

      const receipt = await publicClient.waitForTransactionReceipt({
        hash
      })

      console.log('Transaction confirmed!')
      console.log('Block:', receipt.blockNumber.toString())
      console.log('Status:', receipt.status)

      break
    }

    await new Promise(resolve => setTimeout(resolve, 3000))
  } catch (error) {
    console.log('Error:', error.shortMessage || error.message)
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}
