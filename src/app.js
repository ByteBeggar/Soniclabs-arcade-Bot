import { ethers } from 'ethers'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { CONTRACT as CONTRACT_ADDRESS, GAMES, PRIVATE_KEYS, REFERRER_CODE, RPC } from './config.js'
import log from './log.js'
import { getPrivateKeyType, getRandomUserAgent, toHumanTime, wait } from './utils.js'

export default class App {
  constructor(account, smartAddress, proxy) {
    this.baseUrl = 'https://arcade.soniclabs.com'
    this.host = 'arcade.soniclabs.com'
    this.origin = 'https://arcade.soniclabs.com'
    this.userAgent = getRandomUserAgent()
    this.proxy = proxy
    this.sessionId = 1
    this.wallet = null
    this.today_points = null
    this.total_points = null
    this.account = account
    this.address = null
    this.smartAddress = smartAddress
    this.permitSignature = null
    this.referrerCode = REFERRER_CODE
    this.limitedGames = {
      plinko: false,
      singlewheel: false,
      mines: false,
    }
    this.gameStatus = {
      plinko: { message: 'pending', waiting: '-' },
      singlewheel: { message: 'pending', waiting: '-' },
      mines: { message: 'pending', waiting: '-' },
    }

    try {
      this.provider = new ethers.JsonRpcProvider(RPC.RPCURL, RPC.CHAINID)
    } catch (error) {
      log.error(this.account, `Cannot connect to testnet: ${error}`)
    }
  }

  // Wait function for a specific game with a delay
  async gameWait(game, milliseconds, message) {
    this.gameStatus[game].message = message
    this.gameStatus[game].waiting = toHumanTime(milliseconds)

    await wait(milliseconds, message, this)
  }

  // Connect to the account using either a private key or mnemonic
  async connect() {
    try {
      const cleanPrivateKey = this.account.replace(/^0x/, '')
      await wait(4000, 'Connecting to account: ' + (PRIVATE_KEYS.indexOf(this.account) + 1), this)
      const accountType = getPrivateKeyType(cleanPrivateKey)
      log.info(this.account, 'Account type: ' + accountType)

      if (accountType === 'Mnemonic') {
        this.wallet = ethers.Wallet.fromMnemonic(cleanPrivateKey, this.provider)
      } else if (accountType === 'Private Key') {
        this.wallet = new ethers.Wallet(cleanPrivateKey, this.provider)
      } else {
        throw new Error('Invalid account Secret Phrase or Private Key')
      }

      this.address = this.wallet.address
      await wait(4000, 'Wallet address: ' + JSON.stringify(this.address), this)
    } catch (error) {
      throw error
    }
  }

  // Create a session with the server
  async createSession() {
    await wait(4000, 'Creating session', this)
    const response = await this.fetch('https://sonic-hub1.joinrebellion.com/rpc', 'POST', {
      jsonrpc: '2.0',
      id: this.sessionId,
      method: 'createSession',
      params: {
        owner: this.wallet.address,
        until: Date.now() + 86400000 // 24 hours in milliseconds
      }
    }, { network: 'SONIC', pragma: 'no-cache', 'x-owner': this.address }, 'https://arcade.soniclabs.com/', true)

    this.sessionId += 1
    if (response.status === 200) {
      await wait(1000, 'Session successfully created', this)
    } else {
      throw Error('Failed to create session')
    }
  }

  // Get account balance and update it
  async getBalance(refresh = false) {
    try {
      if (!refresh) {
        await wait(500, 'Reading balance: ' + this.wallet.address, this)
      }
      this.balance = ethers.formatEther(await this.provider.getBalance(this.wallet.address))
      await wait(500, 'Balance updated: ' + this.balance, this)
    } catch (error) {
      log.error(this.account, `Failed to get balance: ${error}`)
      throw error
    }
  }

  // Retrieve user information from the server
  async getUser() {
    await wait(4000, 'Reading user information', this)
    const response = await this.fetch(`https://airdrop.soniclabs.com/api/trpc/user.findOrCreate?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: { address: this.wallet.address } } }))}`, 'GET')
    if (response.status == 200) {
      this.user = response[0].result.data.json
      await wait(500, 'User information successfully retrieved', this)
    } else {
      throw new Error('Failed to get user information')
    }
  }

  // Get points from the game for the account
  async getPoints() {
    if (!this.smartAddress) {
      await wait(500, 'Smart address is not configured, skipping', this)
      return
    }
    await wait(4000, "Checking current points", this)
    try {
      const response = await this.fetch(`https://arcade.gateway.soniclabs.com/game/points-by-player?wallet=${this.smartAddress}`, 'GET', undefined, undefined, 'https://arcade.soniclabs.com/', true)
  
      if (response.status == 200) {
        this.today_points = response.today
        this.total_points = response.totalPoints
        await wait(1500, "Points successfully retrieved", this)
      } else {
        throw new Error("Failed to get points")
      }
    } catch (error) {
      log.error(this.account, `Error getting points: ${error.message}`)
      // Skip the error and continue execution
    }
  }

  // Register user key for access
  async register() {
    try {
      wait(15000, 'Registering user key')
      const abi = new ethers.Interface([{
        'inputs': [{
          'internalType': "address",
          'name': 'spender',
          'type': "address"
        }, {
          'internalType': "uint256",
          'name': 'amount',
          'type': "uint256"
        }],
        'name': 'approve',
        'outputs': [{
          'internalType': "bool",
          'name': '',
          'type': "bool"
        }],
        'stateMutability': "nonpayable",
        'type': 'function'
      }])
      const data = abi.encodeFunctionData("approve", [this.address, ethers.MaxUint256])
      const response = await this.fetch("https://sonic-hub1.joinrebellion.com/rpc", "POST", {
        'jsonrpc': "2.0",
        'id': 0x7,
        'method': "call",
        'params': {
          'call': {
            'dest': '0x4Cc7b0ddCD0597496E57C5325cf4c73dBA30cdc9',
            'data': data,
            'value': '0n'
          },
          'owner': this.address,
          'part': this.part,
          'permit': this.permitSignature
        }
      }, {
        'network': "SONIC",
        'pragma': "no-cache",
        'priority': "u=1, i",
        'x-owner': this.address
      }, "https://arcade.soniclabs.com/", true)
      this.sessionId += 1
      if (response.status == 200) {
        await wait(1500, "User key registered", this)
        await this.getPoints()
      } else {
        await wait(4000, "Failed to register user key", this)
        await this.register()
      }
    } catch (error) {
      await this.register()
    }
  }

  // Refund a game session if a random number is not received
  async refund(game) {
    await wait(1500, `Refunding game ${game} due to missing random number`, this)
    const response = await this.fetch('https://sonic-hub1.joinrebellion.com/rpc', "POST", {
      'jsonrpc': "2.0",
      'id': this.sessionId,
      'method': "refund",
      'params': {
        'game': game,
        'player': this.smartAddress
      }
    }, {
      'network': "SONIC",
      'x-owner': this.address
    }, "https://arcade.soniclabs.com/", true)
    this.sessionId += 1
    if (response.status == 200) {
      await wait(1500, `Successfully refunded game: ${game}`, this)
    } else {
      throw Error("Failed to refund game")
    }
  }

  // Reiterate a game if a random number is not received
  async reIterate(game) {
    await wait(1500, `Reiterating game ${game} due to missing random number`, this)
    const response = await this.fetch("https://sonic-hub1.joinrebellion.com/rpc", "POST", {
      'jsonrpc': '2.0',
      'id': this.sessionId,
      'method': "reIterate",
      'params': {
        'game': game,
        'player': this.smartAddress
      }
    }, {
      'network': "SONIC",
      'x-owner': this.address
    }, "https://arcade.soniclabs.com/", true)
    this.sessionId += 1
    if (response.status == 200) {
      await wait(1500, `Successfully reiterated game: ${game}`, this)
    } else {
      throw Error(`Failed to reiterate game ${game}`)
    }
  }

  // Connect to Sonic Arcade
  async connectToSonic() {
    await wait(4000, 'Connecting to Sonic Arcade', this)

    const messageToSign = "I'm joining Sonic Airdrop Dashboard with my wallet, referred by " + this.referrerCode + ", and I agree to the terms and conditions.\nWallet address:\n" + this.address + "\n"
    log.info(this.account, 'Message to sign: ' + messageToSign)

    this.signatureMessage = await this.wallet.signMessage(messageToSign)
    log.info(this.account, 'Signature: ' + this.signatureMessage)

    await wait(4000, 'Successfully connected to Sonic Dapp', this)
  }

  // Attempt to update the referral code
  async tryToUpdateReferrer() {
    try {
      await wait(4000, 'Verifying referral code', this)

      if (this.user.invitedCode == null) {
        const response = await this.fetch('/api/trpc/user.setInvited?batch=1', 'POST', {
          json: { address: this.wallet.address, invitedCode: this.invitedCode, signature: this.signatureMessage }
        })

        if (response.status == 200) {
          await wait(4000, 'Referral code successfully updated', this)
          await this.getUser()
        }
      } else {
        await wait(4000, 'Referral code is already set', this)
      }
    } catch (error) {
      log.error(this.account, `Failed to update user referral code: ${error}`)
    }
  }

  // Permit Sonic Arcade contract to access the wallet
  async permitTypedMessage() {
    await wait(4000, 'Permitting Sonic Arcade contract', this)
    const response = await this.fetch('https://sonic-hub1.joinrebellion.com/rpc', 'POST', {
      'id': this.sessionId,
      'jsonrpc': '2.0',
      'method': 'permitTypedMessage',
      'params': {
        'owner': this.address
      }
    }, {
      'network': 'SONIC',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'x-owner': this.address
    }, 'https://arcade.soniclabs.com/', true)
    this.sessionId += 1

    if (response.status == 200) {
      const message = JSON.parse(response.result.typedMessage)
      await wait(500, 'Permit successfully created', this)
      await wait(500, 'Approving permit message', this)
      this.permitSignature = await this.wallet.signTypedData(message.json.domain, message.json.types, message.json.message)
      await this.permit()
    } else {
      throw Error('Failed to create Sonic Arcade session')
    }
  }

  // Make an RPC request
  async performRpcRequest(method, params, headers, referer) {
    return this.fetch('https://sonic-hub1.joinrebellion.com/rpc', 'POST', {
      jsonrpc: '2.0',
      id: this.sessionId,
      method: method,
      params: params
    }, headers || { network: 'SONIC', pragma: 'no-cache', 'priority': 'u=1, i', 'x-owner': this.address }, 'https://arcade.soniclabs.com/')
  }

  // Submit permit for the contract
  async permit() {
    await wait(4000, 'Submitting contract permit', this)

    const response = await this.performRpcRequest('permit', {
      owner: this.address,
      signature: this.permitSignature
    })

    this.sessionId += 1

    if (!response.error) {
      this.part = response.result.hashKey
      await wait(4000, 'Permit submitted successfully', this)
    } else {
      throw new Error(`Failed to submit permit: ${response.error.message}`)
    }
  }

  // Play Plinko game
  async playPlinko() {
    await this.playGame('plinko')

    // todo: Implement fetching a random integer (1-0) for further calls
  }

  // Play Single Wheel game
  async playSinglewheel() {
    await this.playGame('singlewheel')
  }

  // Play Mines game and handle game result
  async playMines() {
    await this.playGame('mines')

    if (this.limitedGames['mines']) {
      return
    }

    await this.gameWait('mines', 4000, "Placed", this)
    await this.gameWait('mines', 4000, "Claiming mine game reward", this)

    const response = await this.fetch('https://sonic-hub1.joinrebellion.com/rpc', 'POST', {
      'jsonrpc': "2.0",
      'id': this.sessionId,
      'method': "call",
      'params': {
        'call': {
          'dest': CONTRACT_ADDRESS,
          'data': "0x0d942fd00000000000000000000000008bbd8f37a3349d83c85de1f2e32b3fd2fce2468e0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000e328a0b1e0be7043c9141c2073e408d1086e117500000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000007656e6447616d65000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
          'value': '0n'
        },
        'owner': this.address,
        'part': this.part,
        'permit': this.permitSignature
      }
    }, {
      'network': "SONIC",
      'pragma': "no-cache",
      'priority': "u=1, i",
      'x-owner': this.address
    }, 'https://arcade.soniclabs.com/', true)

    if (response.error) {
      await this.gameWait('mines', 4000, `Failed to claim mine game: ${response.error?.["message"]}`, this)
    }

    if (response.result?.["hash"]?.['errorTypes']) {
      await this.gameWait('mines', 4000, `Claim failed: ${response.result?.["hash"]?.["actualError"]?.["details"]}`, this)
    } else {
      await this.gameWait('mines', 4000, "Successfully played and claimed mine game.", this)
    }
  }

  // General game play function
  async playGame(name) {
    if (!Object.prototype.hasOwnProperty.call(GAMES, name)) {
      throw new Error(`Undefined game: [${name}]`)
    }

    const callData = GAMES[name]

    await this.gameWait(name, 4000, `Playing game: [${name}]`, this)

    const response = await this.performRpcRequest('call', {
      call: callData,
      owner: this.address,
      part: this.part,
      permit: this.permitSignature
    })

    this.sessionId += 1

    if (!response.error) {
      await this.gameWait(name, 4000, `Successfully played game: [${name}]`, this)
    } else {
      const errorMessage = response.error?.message || 'Unknown'

      if (errorMessage.includes('limit')) {
        this.limitedGames[name] = true
        return await this.gameWait(name, 4000, errorMessage, this)
      }

      if (errorMessage.includes('random number')) {
        await this.gameWait(name, 20000, errorMessage, this)
        return await this.reIterate(name)
      }

      if (errorMessage.includes('Permit')) {
        throw new Error(`Failed to play game: [${name}]`.errorMessage)
      }

      if (response.result?.["hash"]?.["errorTypes"]) {
        await wait(1500, `Play game failed: ${response.result?.["hash"]?.["actualError"]?.['details']}`, this)
        return
      }

      throw new Error(`Failed to play game: [${name}], error: ${errorMessage}`)
    }
  }

  // Fetch utility function with request and response logging
  async fetch(url, method, body = {}, customHeaders = {}, referer) {
    log.info(this.account, `Fetching: ${url}`)
    const requestUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`
    const headers = {
      ...customHeaders, ...{
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Content-Type': 'application/json',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Mode': 'cors',
        'Host': this.host,
        'Origin': this.origin,
        'Pragma': 'no-cache',
        'Referer': this.origin,
        'User-Agent': this.userAgent,
      }
    }

    const options = { method, headers, referer }

    try {
      log.info(this.account, `${method} Request URL: ${requestUrl}`)
      log.info(this.account, `Request headers: ${JSON.stringify(headers)}`)

      if (method !== 'GET') {
        options.body = JSON.stringify(body)
        log.info(this.account, `Request body: ${options.body}`)
      }

      if (this.proxy) {
        options.agent = new HttpsProxyAgent(this.proxy, { rejectUnauthorized: false })
      }

      const response = await fetch(requestUrl, options)

      log.info(this.account, `Response status: ${response.status} ${response.statusText}`)

      const contentType = response.headers.get('content-type')
      let responseData = contentType && contentType.includes('application/json')
        ? await response.json()
        : { status: response.status, message: await response.text() }

      log.info(this.account, `Response data: ${JSON.stringify(responseData)}`)

      if (response.ok) {
        responseData.status = 200 // Normalize status to 200 for successful responses
        return responseData
      } else {
        throw new Error(`${response.status} - ${response.statusText}`)
      }
    } catch (error) {
      if (requestUrl.includes('something') && error.message.includes('401')) {
        return { status: 200 }
      } else {
        log.error(this.account, `Error: ${error.message}`)
        throw error
      }
    }
  }
}
