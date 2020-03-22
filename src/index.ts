import * as dotEnv from 'dotenv';
import * as puppeteer from 'puppeteer';
import * as player from 'play-sound';
import * as dayjs from 'dayjs';

dotEnv.config();
const Player = player();

const BASE_URL = process.env.BASE_URL || 'https://primenow.amazon.fr';
const POSTAL_CODE = process.env.POSTAL_CODE || '75018';

const log = (message) => {
    console.log(dayjs().format('YYYY-MM-DD HH:mm:ss'), message);
};

const authenticate = function() {
    return this.getPage(BASE_URL, async page => {
        await page.waitForSelector('input[name="lsPostalCode"]');

        log(`auth ${process.env.EMAIL}`);

        const codeInput = await page.$('input[name="lsPostalCode"]');
        await codeInput.type(POSTAL_CODE, { delay: 100 });

        const codeSubmit = await page.$('.a-button-input');
        await codeSubmit.click();

        await page.waitFor(8000);

        const cartLink = await page.$('[href="/account/address"]');
        await cartLink.click();

        await page.waitFor(8000);

        const emailInput = await page.$('input[name="email"]');
        await emailInput.type(process.env.EMAIL, { delay: 100 });

        const passwordInput = await page.$('input[name="password"]');
        await passwordInput.type(process.env.PASSWORD, { delay: 100 });

        const signSubmit = await page.$('.a-button-input');
        await signSubmit.click();

        await page.waitFor(4000);

        log(`auth done`);
    });
};

const cartTest = function() {
    return this.getPage(`${BASE_URL}/cart`, async page => {
        await page.waitForSelector('.cart-checkout-button');

        const checkoutButton = await page.$('.cart-checkout-button a');
        await checkoutButton.click();

        await page.waitFor(8000);

        const addressInput = await page.$('input[name="addressRadioButton"]');
        if (addressInput) {
            await addressInput.click();

            await page.waitFor(4000);

            const nextButton = await page.$('#shipping-address-panel-continue-button-bottom input');
            await nextButton.click();

            await page.waitFor(6000);
        }

        const deliveryOption = await page.$('input[name="delivery-window-radio"]');

        if (deliveryOption) {
            Player.play('alert.mp3');
            log('delivery options available');
        } else {
            log('unavailable');
        }
    });
};

const createBrowser = async () => {
    let browser = await puppeteer.launch({
        headless: true,
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
    Player.play('alert.mp3');
    const browser = await createBrowser();
    await browser.authenticate();
    setInterval(() => {
        browser.cartTest();
    }, 30000);
})();
