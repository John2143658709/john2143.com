//Node server for john2143.com
// its pretty bloated but its more organized than it used to be
// pending full rewrite

//import
var sys = require("sys");
var server = require("./server.js")

var stdin = process.openStdin();
var stdinglobal = {};
stdin.addListener("data", function(d){
	const str = d.toString().substring(0, d.length - 2); //remove \0 and \n
	try{
		var func = new Function("window", str);
		var ret = func(stdinglobal);
		switch(typeof(ret)){
			case "function":
				console.log("function<>");
				break;
			default:
				console.log(ret);
				break;
		}
	}catch(e){
		console.log(e);
	}
});

var retport = function(server, res, a){
	server.doRedirect(res, "http://john2143.com:" + (a || 80))
};
var showIP = function(server, res){
	server.getExtIP(function(ip){
		server.doHTML(res, ip);
	});
};
const chunks = [
	"<div><b>",
	":</b> ",
	"</div>"
];
var listServers = function(server, res, data){
	var html = [];
	var ind;
	for(var i in servers){
		ind = 0;
		html.push(chunks[ind++]);
		html.push(i);
		html.push(chunks[ind++]);
		html.push(servers[i]);
		html.push(chunks[ind++]);
	}
	server.doHTML(res, html.join(''));
};

//consts
var servers = {
	source: 27015,
	source2: 27016,
	gen: 7777,
	gen2: 7778,
	mc: 25555,
	mc2: 25556,
	web: 80,
	web2: 8000,
	web3: 8080,
};
var redirs = {
	git: "https://github.com/John2143658709/",
	server: "ts3server://uk-voice2.fragnet.net:9992",
	ip: showIP,
	p: retport,
	_def: "git",
	list: listServers,
};

var srv = new server({
	servers: servers,
	redirs: redirs,
	ip: "192.168.1.2",
	port: 80
});
stdinglobal.server = srv;
