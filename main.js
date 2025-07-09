import axios from 'axios';
import { readFile, access } from 'fs/promises';
import log from "./utils/logger.js";
import iniBapakBudi from "./utils/banner.js";
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export async function readWallets() {
    try {
        await access("wallets.json");
        const data = await readFile("wallets.json", "utf-8");
        const wallets = JSON.parse(data);
        return wallets;
    } catch (err) {
        if (err.code === 'ENOENT') {
            log.info("No wallets found in wallets.json");
            return [];
        }
        log.error("Failed to read wallets.json:", err.message);
        return [];
    }
}

export async function readProxies() {
    try {
        await access("proxy.txt");
        const data = await readFile("proxy.txt", "utf-8");
        return data.split('\n').map(line => line.trim()).filter(Boolean);
    } catch (err) {
        if (err.code === 'ENOENT') {
            log.warn("No proxies found in proxy.txt. Requests will proceed without a proxy.");
            return [];
        }
        log.error("Failed to read proxy.txt:", err.message);
        return [];
    }
}

function getRandomProxy(proxies) {
    if (proxies.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * proxies.length);
    return proxies[randomIndex];
}

const claimFaucet = async (address, proxies) => {
    const maxRetries = 20;
    let attempt = 0;
    let currentProxy = getRandomProxy(proxies);

    while (attempt < maxRetries) {
        try {
            const axiosConfig = {
                method: 'post',
                url: 'https://faucet.haust.app/api/claim',
                data: { address },
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
            };

            if (currentProxy) {
                axiosConfig.proxy = false;
                if (currentProxy.startsWith('socks')) {
                    axiosConfig.httpsAgent = new SocksProxyAgent(currentProxy);
                } else if (currentProxy.startsWith('http')) {
                    axiosConfig.httpsAgent = new HttpsProxyAgent(currentProxy);
                } else {
                    log.warn(`⚠️ Unsupported proxy format: ${currentProxy}`);
                }
            } else {
                log.warn(`⚠️ No proxy used for wallet: ${address}`);
            }

            const response = await axios(axiosConfig);

            if (response.status >= 200 && response.status < 300) {
                log.info(`✅ Claim successful for ${address}: ${JSON.stringify(response.data)}`);
                return;
            } else {
                throw new Error(`Unexpected response: ${response.status}`);
            }

        } catch (error) {
            attempt++;
            log.error(`❌ Attempt ${attempt} failed for ${address}: ${error?.message || error}`);
            if (error?.response?.data) {
                log.error(`❗ Server response: ${JSON.stringify(error.response.data)}`);
            }

            if (attempt < maxRetries) {
                currentProxy = getRandomProxy(proxies);
                await new Promise(res => setTimeout(res, 1000));
            } else {
                log.error(`🚫 Failed to claim after ${maxRetries} attempts for ${address}`);
            }
        }
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const main = async () => {
    log.info(iniBapakBudi);
    await delay(3000);

    const wallets = await readWallets();
    const proxies = await readProxies();

    if (wallets.length === 0) {
        log.warn("⚠️ No wallets to process.");
        return;
    }

    for (const wallet of wallets) {
        const address = typeof wallet === 'string' ? wallet : wallet.address;
        if (!address) {
            log.warn("⚠️ Invalid wallet format detected. Skipping...");
            continue;
        }

        log.info(`🚀 Starting claim for: ${address}`);
        await claimFaucet(address, proxies);
        log.info(`⏳ Waiting 5 seconds before next wallet...`);
        await delay(5000); // 5 detik antar wallet
    }

    log.info("✅ All wallet claims processed.");
};

main().catch((err) => {
    log.error("💥 Fatal error in main():", err?.message || err);
});
