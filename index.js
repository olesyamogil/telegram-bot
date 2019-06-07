const config = require('./config.js');

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(config.TELEGRAM_TOKEN);
const easycron = require("easy-cron")({ token: config.EASY_CRON_TOKEN });

const jsdom = require('jsdom');
const { JSDOM } = jsdom;

/**
 * Example: /parse "ІС-з61"
 */
bot.onText(/parse (.+)/, (msg, match)=>{
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const requestedGroup = match[1];

    const supportedGroups = ["ІС-з61"];
    const originalGroupsList = supportedGroups.filter(function (originalGroupName) {
        return originalGroupName.toUpperCase() === requestedGroup.toUpperCase();
    });
    const originalGroup = originalGroupsList.length ? originalGroupsList[0] : false;

    if (originalGroup) {
        sendForm(userId, chatId, originalGroup);
    } else {
        bot.sendMessage(chatId, "Unknown group. Supported groups:");
        supportedGroups.forEach(function (groupName) {
            bot.sendMessage(chatId, groupName);
        })
    }

});

function sendForm (userId, chatId, group){
    JSDOM.fromURL('http://rozklad.kpi.ua/Schedules/ScheduleGroupSelection.aspx')
        .then((dom) => {
            const form = dom.window.document.querySelectorAll('form input');
            let formData = {};
            let formArray = Array.from(form);
            formArray.forEach(function(item){
                formData[item.getAttribute("name")]=item.value;
            });
            formData["ctl00$MainContent$ctl00$txtboxGroup"] = group;
            let request = require("request"),
                options = {
                    url: 'http://rozklad.kpi.ua/Schedules/ScheduleGroupSelection.aspx',
                    timeout: 2000,
                    followAllRedirects: true,
                    method: 'POST',
                    formData: formData
                };
            request.post( options, function(error, response, body) {
                //console.log( body );
                const scheduleDOM = new JSDOM(body);
                const table = scheduleDOM.window.document.getElementById('ctl00_MainContent_FirstScheduleTable');
                if (!table) {
                    console.error("Cannot send form");
                    bot.sendMessage(userId, "Cannot parse the page");
                    return false;
                }
                const rows = Array.from(table.getElementsByTagName('tr'));

                let currentDay;
                let currentMonth;
                rows.forEach(function (item, rowIndex) {
                    const firstColumn = item.querySelector('td:nth-child(1)');
                    const secondColumn = item.querySelector('td:nth-child(2)');

                    // Head line for day
                    if (!firstColumn.textContent
                        && secondColumn.textContent
                        && secondColumn.textContent.match(/[0123]\.[01][0-9]/)) {
                        const dateTokens = secondColumn.textContent.split('.');
                        currentDay = parseInt(dateTokens[0]);
                        currentMonth = parseInt(dateTokens[1]);
                    } else { // Every single class
                        const firstColumnArray = Array.from(firstColumn.childNodes);
                        const secondColumnArray = Array.from(secondColumn.childNodes);
                        if (firstColumnArray.length === 3 && secondColumnArray.length === 5) {
                            const TIME_COLUMN_INDEX = 2;

                            const classStartTime = firstColumnArray[TIME_COLUMN_INDEX].textContent;
                            let classStartHour, classStartMinute;
                            if (classStartTime.match(/[012][0-9]:[1-5][0-9]/)) {
                                const timeTokens = firstColumnArray[TIME_COLUMN_INDEX].textContent.split(':');
                                classStartHour = timeTokens[0];
                                classStartMinute = timeTokens[1];
                            }

                            const classDescription = secondColumnArray.reduce(
                                (accumulator, currentValue) => {
                                    return accumulator + currentValue.textContent + '\n'
                                },
                                '');
                            const message = `${currentDay}.${currentMonth} ${classStartHour}:${classStartMinute} \n ${classDescription}`;
                            bot.sendMessage(userId, message);
                            easycron.add({
                                minute: classStartMinute,
                                hour: classStartHour,
                                day: currentDay,
                                month: currentMonth,
                                url: `${config.APP_URL}/sendNow?chat_id=${chatId}&text=${text}`,
                                method: 'GET',

                            }).then(function(response) {
                                console.log("Cron Job Id is " + response.cron_job_id);
                            }).catch(function(error) {
                                console.error('Something went wrong');
                                console.log(error)
                            });
                        }
                    }
                });
            });
        });

}

bot.onText(/remind (.+) at (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const text = match[1];
    const today = new Date();
    const timeTokens = match[2].split(':');
    easycron.add({
        minute: timeTokens[1],
        hour: timeTokens[0],
        day: today.getDate(),
        month: today.getMonth()+1,
        url: `${config.APP_URL}/sendNow?chat_id=${chatId}&text=${text}`,
        method: 'GET'

    }).then(function(response) {
        console.log("Cron Job Id is " + response.cron_job_id);
    }).catch(function(error) {
        console.error('Something went wrong');
        console.log(error)
    });
});

const express     = require("express");
const bodyParser  = require("body-parser");
const app         = express();

//Here we are configuring express to use body-parser as middle-ware.
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Function to handle the root path
app.get('/sendNow', (req, res) => {
    bot.sendMessage(req.query.chat_id, req.query.text);
    res.end('OK');
});
// Function to handle the root path
app.post(`/bot${config.TELEGRAM_TOKEN}`, (req, res) => {
    console.log(req.body);
    bot.processUpdate(req.body);
    // Return the articles to the rendering engine
    res.end('ddddd');
});

let server = app.listen(config.APP_PORT, function() {
    console.log('Server is listening on port ' + config.APP_PORT)
});
