import { createPublicClient, http } from 'viem'

const client = createPublicClient({
  transport: http('https://rpc.testnet.arc.io')
})

const blockNumber = await client.getBlockNumber()

console.log('Connected to Arc Testnet!')
console.log('Current block:', blockNumber.toString())
