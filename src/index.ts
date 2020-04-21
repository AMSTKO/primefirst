import * as dotEnv from 'dotenv';
import * as puppeteer from 'puppeteer';
import * as player from 'play-sound';
import * as dayjs from 'dayjs';
import { exists } from 'fs';
import { throws } from 'assert';
import TelegramClient from 'messaging-api-telegram';

dotEnv.config();
const Player = player();

const BASE_URL = process.env.BASE_URL || 'https://primenow.amazon.fr';
const POSTAL_CODE = process.env.POSTAL_CODE || '75018';

const TELEGRAM_NOTIFY = (process.env.TELEGRAM_NOTIFY == 'True');
const BOT_TOKEN = process.env.BOTTOKEN;
const CHAT_ID = process.env.CHATID;
const NOTIFICATION_DELAY = parseInt(process.env.NOTIFICATION_DELAY) || 300000;
const TELEGRAM_MESSAGE = process.env.TELEGRAM_MESSAGE || "Delivery options available!"
const CHECKDELIVERY_DELAY = parseInt(process.env.CHECKDELIVERY_DELAY) || 30000
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOTTOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHATID

var client;
var last_notification_dt = new Date(0);

if (TELEGRAM_NOTIFY) {
    console.log("Telegram notifications active!")
    const { TelegramClient } = require('messaging-api-telegram');
    client = TelegramClient.connect(TELEGRAM_BOT_TOKEN);
}

const reader = require("readline-sync");

const log = (message) => {
    console.log(dayjs().format('YYYY-MM-DD HH:mm:ss'), message);
};

const authenticate = function() {
    return this.getPage(BASE_URL, async page => {
        await page.waitForSelector('input[name="lsPostalCode"]');

        log(`Authorizing with: ${process.env.EMAIL} ...`);

        const codeInput = await page.$('input[name="lsPostalCode"]');
        await codeInput.type(POSTAL_CODE, { delay: 100 });

        const codeSubmit = await page.$('.a-button-input');
        await codeSubmit.click();

        await page.waitFor(4000);

        const cartLink = await page.$('[href="/account/address"]');
        await cartLink.click();

        await page.waitFor(4000);

        const emailInput = await page.$('input[name="email"]');
        await emailInput.type(process.env.EMAIL, { delay: 100 });

        const passwordInput = await page.$('input[name="password"]');
        await passwordInput.type(process.env.PASSWORD, { delay: 100 });

        const signSubmit = await page.$('.a-button-input');
        await signSubmit.click();

        await page.waitFor(4000);

        let CaptchaImage = await page.evaluate(() => document.querySelector('img[id="auth-captcha-image"]'), element => element.getAttribute('src'));

        if (CaptchaImage) {
            log(`Your login requiere captcha`);
            log("https://opfcaptcha-prod.s3.amazonaws.com" + CaptchaImage);
            //TODO Save to disk and capture value from user.
            return false;
        }

        let ConfirmLoginOptions = await page.evaluate(() => Array.from(document.querySelectorAll('input[name="option'), element => element.getAttribute('value')));

        if (ConfirmLoginOptions.length>0) {

            // TODO: Allow to choose validation option           
            //            console.log(`Your amazon login requiere validation, choose one option:`);

            //            var value = 0 ;
            //            for (let notificationOption of ConfirmLoginOptions) 
            //            {
            //                value += 1;
            //                console.log(value + '. '+ notificationOption);
            //            }
                        
            //            const readline = require('readline').createInterface({
            //                input: process.stdin,
            //                output: process.stdout
            //            })
                        
            //            const notificationSelection = '';
            //            await readline.question(`Type the number of your option: `, (notificationSelection) => {
            //                readline.close()
            //            })

            // Select SMS option:
            await page.evaluate(() => {
                document.querySelector('input[value="sms"]').parentElement.click();
            });

            // Continue
            const signSubmit = await page.$('.a-button-input');
            await signSubmit.click();
            await page.waitFor(4000);

            // Fill SMSCode
            let smscode = reader.question("SMS Code: ");
            const passwordInput = await page.$('input[name="code"]');
            await passwordInput.type(smscode, { delay: 100 });
            // Continue
            const signSubmit2 = await page.$('.a-button-input');
            await signSubmit2.click();
            await page.waitFor(4000);
        }

        // Validate login
        let yourAccountMenu = await page.evaluate(() => document.querySelector('div[id="yourAccountMenu"]'));
        if (yourAccountMenu) {
            log(`Auth done`);
            return true
        } else {
            log(`Auth failed!`);
            return false
        }
    });
};

const cartTest = function() {
    return this.getPage(`${BASE_URL}/cart`, async page => {

        await page.waitFor('body div');

        // Validate postal code change (products out of postal code)
        let formUpdatePostalCode = await page.evaluate(() => document.querySelector('form[action^="/cart/updatePostalCode?newStack="'));
        if (formUpdatePostalCode) {
            log("Confirmation for products not available in current postalcode")
            const continueButton = await page.$('.a-button-input');
            await continueButton.click();
            await page.waitFor(3000);
        }

        //Multimerchant support
        var merchant_count = 0
        let allMerchants = await page.evaluate(() => Array.from(document.querySelectorAll('.a-button.a-button-normal.a-button-primary.cart-checkout-button'), element => element.className.split(" ")[4]));
        if (allMerchants.length > 0) {
            for (let merchantOption of allMerchants) {
                merchant_count = merchant_count +1
                log (`${merchant_count} of ${allMerchants.length}: Checking merchant: ${merchantOption}`);
              
                const checkoutSubmit = await page.$('.cart-checkout-button.' + merchantOption);
                await checkoutSubmit.click();
                
                await page.waitFor('body div');

                // Sometimes ask for address
                const addressInput = await page.$('input[name="addressRadioButton"]');
                if (addressInput) {
                    //Select Address 
                    log ('Selecting  address ...');
                    await addressInput.click();
                    await page.waitFor(4000);
        
                    const nextButton = await page.$('#shipping-address-panel-continue-button-bottom input');
                    await nextButton.click();
        
                    await page.waitFor(6000);
                }

                // Check for deliveryOption  
                const deliveryOption = await page.$('input[name="delivery-window-radio"]');
        
                if (deliveryOption) {
                    log (`[${merchantOption}] Delivery Options available!!`);
                    Player.play('alert.mp3');
        
                    if (TELEGRAM_NOTIFY) {
                        // Control telegram notifications
                        var dt = new Date();
                        if ( dt.getTime() - last_notification_dt.getTime() > NOTIFICATION_DELAY) {
                            last_notification_dt = new Date();
                            client.sendMessage(CHAT_ID, TELEGRAM_MESSAGE +'[' + merchantOption + ']' + ' ' + BASE_URL)
                        }
                    }
                } else {
                    log(`[${merchantOption}] No delivery options available.`);
                }

                //Next check
                if (merchant_count < allMerchants.length) {
                    log ('Checking next merchant...');
                    await page.goto(`${BASE_URL}/cart`);
                    await page.waitForNavigation()
                }
        if (deliveryOption) {
            Player.play('alert.mp3');
            log('delivery options available');
            if (TELEGRAM_NOTIFY) {
                client.sendMessage(TELEGRAM_CHAT_ID, 'Delivery options available! : '+ BASE_URL)
            }
        } else {
            log("Checkout not available, check your cart");
            return false;
        }

    });
};

const createBrowser = async () => {
    let browser = await puppeteer.launch({
        headless: true,
        devtools: false,
        args: ['--lang=en-US,en'],
    });

    const getPage = async function getPage(url, fn) {
        let page: puppeteer.Page;
        let result;

        try {
            page = await browser.newPage();

            await page.setViewport({ width: 1200, height: 800 })
            await page.goto(url, { waitUntil: 'load' });

            page.on('console', msg => {
                const leng = msg.args().length;
                for (let i = 0; i < leng; i += 1) {
                    console.log(`${i}: ${msg.args()[i]}`);
                }
            });

            result = await fn(page);
            await page.close();
        } catch (e) {
            if (page) {
                await page.close();
            }

            throw e;
        }

        return result;
    };

    const close = async function close() {
        await browser.close();
        browser = null;
    };

    return {
        getPage,
        close,
        authenticate,
        cartTest,
    };
};

(async () => {
    log('init');
    const browser = await createBrowser();
    if (await browser.authenticate() == true) {
        setInterval(() => {
            browser.cartTest();
        }, CHECKDELIVERY_DELAY);
    } else {
        log('Failed to login.');
        process.exit();
    }
})();
