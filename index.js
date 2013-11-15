var irc = require("irc");
var fs = require("fs");
var redis = require("redis");

var config = {
	channels : ["#tqvcancun"],
	server : "chat.freenode.net",
	botName : "secretaryjs",
	username : "alexserver", //this is the nick that the bot will record messages for.
	usernames : ["alexserver", "JZA"]
};

var cn_config = {
	host: "127.0.0.1",
	port: 6379,
	db: 0,
	password: null
};

var bot = new irc.Client(config.server, config.botName, {
	channels: config.channels
});

/**
 * Listeners
 */

bot.addListener('message', function(from, to, msg, raw){
	console.log("Message -> From: "+from+", To:"+to+" >>> "+msg);
	if (from == config.username) {
		if ((/^getmsg/).test(msg)) {
			//please retrieve messages...
			readFromRedis();
		}
		else if((/^flushmsg/).test(msg)) {
			flushRedis();
		}
		else {
			saveInRedis(from, to, msg, raw);
		}
	}
	else {
		saveInRedis(from, to, msg, raw);
	}
});

bot.addListener('error', function(message) {
    console.log('error: ', message);
});

/**
 * connect to Redis...
 */
var db = redis.createClient(6379, "127.0.0.1");
db.on('error', function(e){
	console.log("Error: "+e);
});
/**
 * Functions
 */

function saveInRedis(from, to, msg, raw){
	//save the data...
	var today = new Date();
	var key = "user:"+config.username+":messages";
	var data = {
		"from": from,
		"to": to,
		"msg": msg,
		"date": today.toString(),
		"raw": raw
	};
	db.send_command("rpush", [ key, JSON.stringify(data)], redis.print);
}

function readFromRedis(){
	var key = "user:"+config.username+":messages";
	var json, body;
	db.send_command("lrange", [key, 0, -1], function(x,data){
		for (var i in data) {
			json = JSON.parse( data[i] );
			body = "Message -> From: "+json.from+", To:"+json.to+" >>> "+json.msg;
console.log(body);
			bot.say(config.username, body);
		}
	});
}
function flushRedis() {
	var key = "user:"+config.username+":messages";
	db.send_command('del', [key], function(){
		bot.say(config.username, "pipe flused");
	});
}

function go1(from, msg) {
	var dataFile = "data.json";
	var data = {messages:[]};
	fs.exists(dataFile, function(exists){
		if (exists) {
			//read it...
			datastr = fs.readFile(dataFile, function(err, str){
				if (err) throw err;
				data = JSON.parse(str);
				if (!("messages" in data)) {
					data.messages = [];
				}
//this is the problem !! this is within a callback !!!
				go2(data, from, msg, dataFile);
			});
		}
		else {
			go2(data, from, msg, dataFile);
		}
	});
}
function go2(data, from, msg, dataFile) {
	//goes to data
	data.messages.push({
		from: from,
		text: msg
	});
	fs.writeFile(dataFile, JSON.stringify(data), function(){
		console.log("message saved : " + msg);
	});
}