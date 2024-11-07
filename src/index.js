import fs from "fs"
import App from './app.js'
import { PRIVATE_KEYS, PROXIES, SMART_ADDRESSES } from './config.js'
import log from './log.js'
import Output from './output.js'
import { toHumanTime, wait } from './utils.js'
// Function to play a specific game until the game limit is reached
async function play(app, game) {
  while (!app.limitedGames[game]) {
    const method = 'play' + game.charAt(0).toUpperCase() + game.slice(1)
    try {
      await app[method]()
      await app.getPoints()
    } catch (error) {
      await app.gameWait(game, 30000, error)
    }
  }
}

// Function to initialize and run the bot for a specific account, smart address, and proxy
async function run(account, smartAddress, proxy) {
  const app = new App(account, smartAddress, proxy)
  try {
    log.info(account, `Initializing account: ${PRIVATE_KEYS.indexOf(account) + 1} (${account})`)
    await app.connect()
    await app.getBalance()
    await app.connectToSonic()
    await app.getUser()
    await app.getPoints()
    await app.tryToUpdateReferrer()
    await app.createSession()
    await app.permitTypedMessage()

    await play(app, 'plinko')
    await play(app, 'mines')
    await play(app, 'singlewheel')

    // Schedule the next cycle
    const duration = 2 * 3600 * 1000 // 2 hours
    log.info(account, `Cycle completed for account ${app.address}. Pausing for ${toHumanTime(duration)}`)
    await wait(duration, `Waiting for the next cycle: ${toHumanTime(duration)}`, app)

    return run(account, smartAddress, proxy)
  } catch (error) {
    log.info(account, `Error encountered. Retrying in 60 seconds.`)
    await wait(60000, `Error: ${error.message || JSON.stringify(error)}. Retrying in 60 seconds`, app)
    return run(account, smartAddress, proxy)
  }
}

// Function to start the bot for all accounts
async function startBot() {
  try {
    if (PROXIES.length !== PRIVATE_KEYS.length && PROXIES.length !== 0) {
      throw new Error(`The number of proxies must match the number of accounts or be empty.`)
    }

    const tasks = PRIVATE_KEYS.map((account, index) => {
      run(account, SMART_ADDRESSES[index] || undefined, PROXIES[index] || undefined)
      log.info(account, `Account started: ${account}`)
    })

    await Promise.all(tasks)
  } catch (error) {
    console.error('Bot stopped due to error:', error)
  }
}

// Main function to clear logs, start the bot, and handle any critical errors
(async () => {
  try {
    fs.rmSync('logs/', { recursive: true })
    console.clear()

    await startBot()
  } catch (error) {
    Output.clearInfo()
    console.error('Critical error encountered, restarting...', error)
    await startBot() 
  }
})()
