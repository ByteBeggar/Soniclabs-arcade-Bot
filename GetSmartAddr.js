import axios from 'axios';
import fs from 'fs/promises';
import { ethers } from 'ethers';

// Function to retrieve the smart wallet address using the owner's address and RPC URL
async function getSmartWalletAddress(ownerAddress, rpcUrl) {
  const payload = {
    jsonrpc: "2.0",
    id: 14,
    method: "eth_call",
    params: [
      {
        data: `0x5fbfb9cf000000000000000000000000${ownerAddress.slice(2)}0000000000000000000000000000000000000000000000000000000000000000`,
        to: "0x5a174Dd1272Ea03A41b24209ed2A3e9ee68f9148"
      },
      "latest"
    ]
  };

  try {
    // Send a POST request to the RPC URL with the specified payload
    const response = await axios.post(rpcUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    // Extract and return the smart wallet address from the response, if available
    if (response.data && response.data.result) {
      const smartWalletAddress = "0x" + response.data.result.slice(26);
      return smartWalletAddress.toLowerCase();
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

// Function to read private keys from a file, process each, and write the smart wallet addresses to a new file
async function processPrivateKeys() {
  const rpcUrl = "https://rpc.testnet.soniclabs.com/";
  
  try {
    // Read private keys from 'privatekey.txt'
    const privateKeys = await fs.readFile('privatekey.txt', 'utf-8');
    const privateKeyList = privateKeys.split('\n').filter(key => key.trim() !== '');

    let walletOutput = '';

    // Process each private key
    for (let i = 0; i < privateKeyList.length; i++) {
      const privateKey = privateKeyList[i].trim();
      const wallet = new ethers.Wallet(privateKey);
      const address = wallet.address;

      // Get the smart wallet address for the current address
      const smartWallet = await getSmartWalletAddress(address, rpcUrl);
      
      // If successful, add the smart wallet address to output
      if (smartWallet) {
        walletOutput += `${smartWallet}\n`;
        console.log(`Processing wallet ${i + 1}: ${address} -> ${smartWallet}`);
      } else {
        walletOutput += `Error processing wallet ${i + 1}: ${address}\n`;
        console.error(`Error processing wallet ${i + 1}: ${address}`);
      }
    }

    // Write all smart wallet addresses to 'wallet.txt'
    await fs.writeFile('wallet.txt', walletOutput);
    console.log('Smart wallet addresses have been written to wallet.txt');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Start processing private keys
processPrivateKeys();
