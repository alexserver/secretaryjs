var irc = require("irc");
var fs = require("fs");
var redis = require("redis");
var nodemailer = require("nodemailer");

var config = {};
var db, bot;

//read config file.
fs.readFile(__dirname+'/config.json', 'utf8', function(err, data){
    if (err) {
        console.log(err);
    }
    config = JSON.parse(data);
    main();
});

//the void main function
var main = function() {
    //run the bot
    bot = new irc.Client(config.server, config.botName, {
        channels: config.channels
    });
    //run the redis
    db = connectToRedis();

    db.on('error', function(e){
        console.log("Error: "+e);
    });

    /**
     * Listeners
     */
    bot.addListener('error', function(message) {
        console.log('error: ', message);
    });

    bot.addListener('message#', doMessage);
    bot.addListener('join', doJoin);
    bot.addListener('part', doPart);
    bot.addListener('pm', doPrivate);

/*
    bot.addListener('message', function(from, to, msg, raw){
        console.log("Message -> From: "+from+", To:"+to+" >>> "+msg);
        //if comes as private from username, so it's a command
        if (from == config.username && to == config.botName) {
            var params = msg.split(' ');
            if ((/^getmsg/).test(msg)) {
                //please retrieve messages...
                filter = (params[1] !== "undefined")? params[1] : null;
                readFromRedis(config.username, filter, function(x){
                    sayMessages(config.username, x);
                });
            }
            else if ((/^sendmsg/).test(msg)) {
                //send messages by email
                filter = (params[1] !== "undefined")? params[1] : null;
                readFromRedis(config.username, filter, function(x){
                    sendMessagesByMail(config.username, x);
                });
            }
            else if((/^flushmsg/).test(msg)) {
                flushRedis();
            }
            else {
                saveInRedis(config.username, {"from":from, "to":to, "msg":msg, "raw":raw});
            }
        }
        else {
            saveInRedis(config.username, {"from":from, "to":to, "msg":msg, "raw":raw});
        }
    });
*/

};

function connectToRedis() {
    var cn, cn_options = {};
    if (config.connection.password !== null && config.connection.password !== "") {
        cn_options.auth_pass = config.connection.password;
    }
    cn = redis.createClient(config.connection.port, config.connection.host, cn_options);
    cn.on("ready", function(){
console.log('ready connection to Redis !');
    });
    return cn;
}

function doMessage(from, to, msg, raw){
    console.log('message ==========================');
    console.log('<'+from+'>@'+to+': '+msg);
    saveInRedis(config.username, {"from":from, "to":to, "msg":msg, "raw":raw, "msgtype": "channel"});
}

function doPrivate(from, msg){
    console.log('private ==========================');
    console.log('from <'+from+'> : '+msg);
    if (from == config.username) {
        var params = msg.split(' ');
        if ((/^getmsg/).test(msg)) {
            //please retrieve messages...
            filter = (params[1] !== "undefined")? params[1] : null;
            readFromRedis(config.username, filter, function(x){
                sayMessages(config.username, x);
            });
        }
        else if ((/^sendmsg/).test(msg)) {
            //send messages by email
            filter = (params[1] !== "undefined")? params[1] : null;
            readFromRedis(config.username, filter, function(x){
                sendMessagesByMail(config.username, x);
            });
        }
        else if((/^flushmsg/).test(msg)) {
            flushRedis();
        }
        else {
            saveInRedis(config.username, {"from":from, "to":to, "msg":msg, "raw":raw, "msgtype": "private"});
        }
    }
}

function doJoin(channel, nick, msg){
    console.log('join ==========================');
    console.log('channel: '+channel);
    console.log('nick: ' + nick);
    console.log('message: ' + msg);
    if (nick == config.username) {
    }
}

function doPart(channel, nick, reason, msg){
    console.log('leave ==========================');
    console.log('channel: '+channel);
    console.log('nick: ' + nick);
    console.log('message: ' + msg);
}

/**
 * Functions
 */
function saveInRedis(user, data){
    //save the data...
    var today = new Date();
    var key = "user:"+user+":messages";
    data['mention'] = ( data.msg.toLowerCase().indexOf(user.toLowerCase())>-1 );
    data['date'] = today.getTime().toString();
    db.send_command("rpush", [ key, JSON.stringify(data)], redis.print); //OK !!!
}

function readFromRedis(user, filter, fn){
    var key = "user:"+user+":messages";
    var json, body;
    var messages = [];
    db.send_command("lrange", [key, 0, -1], function(err, replies){
        if (err) {
            console.log(err);
            return;
        }
        if (replies) {
            for (var i in replies) {
                json = JSON.parse( replies[i] );
                if (filter) {
                    if (json.to === filter) {
                        messages.push(json);
                    }
                }
                else {
                    messages.push(json);
                }
            }
        }
        if (typeof fn == "function") {
            fn(messages);
        }
    });
}

function flushRedis() {
    var key = "user:"+config.username+":messages";
    db.send_command('del', [key], function(){
        bot.say(config.username, "pipe flused");
    });
}

function sayMessages(user, messages) {
    var body="";
    for (var i in messages) {
        body = "<"+messages[i].from+">: "+messages[i].msg;
        bot.say(config.username, body);
    }
}

function sendMessagesByMail(user, messages) {
    //instance mailer
    var smptTransport = nodemailer.createTransport("SMTP", {
        "service": config.emailing.service,
        "auth": {
            "user": config.emailing.username,
            "pass": config.emailing.password
        }
    });
    var html = "", text = "";
    html = "<h1>Daily log from irc: "+ new Date() + "</h1>";
    text = "Daily log from irc: "+ new Date() + "\n";
    for(var i in messages){
        if (messages[i].msgtype=="private") {
            html += "<p><b>"+messages[i].from+"@"+messages[i].to+"[PM]</b>: "+messages[i].msg+"</p>";
        }
        else {
            html += "<p><b>"+messages[i].from+"@"+messages[i].to+"</b>: "+messages[i].msg+"</p>";
        }
        text += messages[i].from + ": " + messages[i].msg+"\n";
    }
    var mailoptions = {
        "from": config.emailing.username,
        "to": config.email,
        "subject": "IRC daily " + new Date(),
        "text": "Hello",
        "html": html
    };
    smptTransport.sendMail(mailoptions, function(err, response){
        if (err) {
            console.log(err);
        }
        else {
            console.log("Message sent: "+response.message);
        }
    });
}