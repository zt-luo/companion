var express = require('express');
var app = express();
const child_process = require('child_process');
const dgram = require('dgram');
const SocketIOFile = require('socket.io-file');
var logger = require('tracer').console();
var os = require("os");
var env = process.env
var home_dir = process.env.HOME
logger.log('ENVIRONMENT', process.env)
logger.log('COMPANION_DIR', process.env.COMPANION_DIR)
logger.log('HOME_DIR', process.env.HOME)
app.use(express.static('public'));
app.use('/webui.log', express.static(home_dir+'/.webui.log'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/font-awesome', express.static(__dirname + '/node_modules/font-awesome')); // redirect JS jQuery
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap
app.use('/style.css', express.static(__dirname + '/style.css')); // redirect CSS bootstrap
app.use('/js', express.static(__dirname + '/node_modules/network-js/dist'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap-switch/dist/js'));
app.use('/css', express.static(__dirname + '/node_modules/bootstrap-switch/dist/css/bootstrap2'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap-select/dist/js'));
app.use('/css', express.static(__dirname + '/node_modules/bootstrap-select/dist/css'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap-slider/dist'));
app.use('/css', express.static(__dirname + '/node_modules/bootstrap-slider/dist/css'));

var fs = require("fs");
var expressLiquid = require('express-liquid');
var options = {
	// read file handler, optional 
	includeFile: function (filename, callback) {
		fs.readFile(filename, 'utf8', callback);
	},
	// the base context, optional 
	context: expressLiquid.newContext(),
	// custom tags parser, optional 
	customTags: {},
	// if an error occurred while rendering, show detail or not, default to false 
	traceError: false
};
app.set('view engine', 'liquid');
app.engine('liquid', expressLiquid(options));
app.use(expressLiquid.middleware);

// Companion repository root directory
var _companion_directory = process.env.COMPANION_DIR;

var v4l2camera = require("v4l2camera");

var cameranew = require("./camera.js");

cameranew.currentformat();

// Load saved user camera/streaming profiles
cameranew.loadprofiles();

// Load the last known camera settings
cameranew.loadlastsettings();

// Create camera objects, set all camera settings on all cameras to the
// last known settings
cameranew.createnewobject();

////////////////// Routes

// root
app.get('/', function(req, res) {
	res.redirect('/network');
});

app.get('/routing', function(req, res) {
	res.render('routing', {});
});

app.get('/system', function(req, res) {
	res.render('system', {});
});

app.get('/camera', function(req, res) {
	res.render('camera', {});
});

app.get('/mavproxy', function(req, res) {
	res.render('mavproxy', {});
});

app.get('/network', function(req, res) {
	res.render('network', {});
});

app.get('/waterlinked', function(req, res) {
	res.render('waterlinked', {});
});

app.get('/security', function(req, res) {
	res.render('security', {});
});

app.get('/vlc.sdp', function (req, res) {
  var file = __dirname + '/files/vlc.sdp';
  res.download(file);
});

app.get('/test', function(req, res) {
	var module = req.query['module'];
	//console.log("Dealing with: ", module);

	// Match headers found @ https://github.com/nesk/network.js/blob/master/server/server.php
	res.set({
		// Make sure the connection closes after each request
		'Connection': 'close',
		// Don't let any caching happen
		'Cache-Control': 'no-cache, no-store, no-transform',
		'Pragma': 'no-cache',
		'Access-Control-Allow-Origin': '*',
	});
	
	if (module && module == 'download') {
		// It is way too slow to generate the response content in a for loop, it affects the measured bandwidth by a factor of 50+
		// Instead, just send this file
		res.sendFile(_companion_directory + '/tools/100MB.file');
		
		// Thank you https://github.com/nesk/network.js/pull/62
//		// Define a content size for the response, defaults to 20MB.
//		var contentSize = 100 * 1024 * 1024;
//		if (req.query['size'])
//		{
//			contentSize=parseInt(req.query['size']);
//			contentSize=Math.min(contentSize,200*1024*1024);
//		}
//
//		// Provide a base string which will be provided as a response to the client
//		var baseString='This text is so uncool, deal with it. ';
//		var baseLength=baseString.length;
//		// Output the string as much as necessary to reach the required size
//
//		for (var i = 0 ; i < Math.floor(contentSize / baseLength) ; i++) {
//			console.log(i)
//			if (res.finished) {
//				console.log("closed early!");
//				break;
//			}
//			res.write(baseString + i);
//		}
//		// If necessary, complete the response to fully reach the required size.
//		if (( lastBytes = contentSize % baseLength) > 0) 
//		{
//			res.end(baseString.substr(0,lastBytes));
//		}
	} else {
		res.send('OK');
	}
});

app.post('/test', function(req, res) {
	var module = req.query['module'];
	//console.log("Dealing with: ", module);
	res.set('Content-Type', 'text/html; charset=UTF-8');
	res.set('Connection', 'close');
	
	var body = ''
	
	var length = 0;
	
	if (module && module == 'upload') {
		req.on('data', function(data) { });
	
		req.on('end', function() {
			console.log('end', length);
			res.send('bye.');
		});
	} else {
		res.send("bye.");
	}
});

app.get(home_dir+'/server.php', function(req, res) {
	return res.sendFile(home_dir+'/server.php');
});

app.get('/git', function(req, res) {
	res.render('git', {});
});

app.get('/socket.io-file-client.js', (req, res, next) => {
	return res.sendFile(__dirname + '/node_modules/socket.io-file-client/socket.io-file-client.js');
});

app.get('/network.min.js', (req, res, next) => {
	return res.sendFile(__dirname + '/node_modules/network-js/dist/network.min.js');
});

var server = app.listen(2770, function() {
	var host = server.address().address;
	var port = server.address().port;
	logger.log("App running at http://%s:%s", host, port);
	
	var cmd = child_process.exec('git describe --tags', function(error, stdout, stderr) {
		logger.log('Companion version: ', stdout);
	});
	
	var cmd = child_process.exec('git rev-parse HEAD', function(error, stdout, stderr) {
		logger.log('Git revision: ', stdout);
	});
});

var io = require('socket.io')(server);

// Git
var gitsetup = io.of('/gitsetup');
var gitnew = require('./git.js')(io);
gitnew.gitsocket();

// Network
var networknew = require("./networkpage.js")(io);
networknew.networksocket();
networknew.networksocketio();

networknew.updateInternetStatus(true);
setInterval(networknew.updateInternetStatus, 2500, false);

//System
var systemnew = require("./system.js")(io);	
// Make updateCPUStats() run once every 5 seconds (=os.loadavg() update rate)
setInterval(systemnew.updateCPUStats, 5000);
setInterval(systemnew.givemav, 4000);

//Camera
cameranew.camerasocket(io);
systemnew.systemsocket();

//Mavproxy
var mavnew = require("./mavproxy.js")(io);
mavnew.mavsocket();

//Routing
var routenew = require("./routing.js")(io);
routenew.routingsocket();

io.on('connection', function(socket) {

	socket.on('restart video', function(data) {
		logger.log(_companion_directory + '/scripts/restart-raspivid.sh "' + data.rpiOptions + '" "' + data.gstOptions + '"');
		var cmd = child_process.spawn(_companion_directory + '/scripts/restart-raspivid.sh', [data.rpiOptions , data.gstOptions], {
			detached: true
		});
		
		cmd.unref();
		
		cmd.stdout.on('data', function (data) {
			logger.log(data.toString());
		});
		
		cmd.stderr.on('data', function (data) {
			logger.log(data.toString());
		});
		
		cmd.on('exit', function (code) {
			logger.log('pixhawk update exited with code ' + code.toString());
			socket.emit('video up');
		});
		
		cmd.on('error', (err) => {
			logger.log('Failed to start child process.');
			logger.log(err.toString());
		});
	});

	socket.on('set password', function(data) {
		logger.log('Updating Password');
		var user	= 'pi';
		var cmd = child_process.spawn('sudo',
            [_companion_directory + '/tools/set-password.py', '--user=' + user,
            '--oldpass=' + data.oldpass, '--newpass=' + data.newpass], {
			detached: true
		});

		cmd.unref();

		cmd.stdout.on('data', function (data) {
			logger.log(data.toString());
		});

		cmd.stderr.on('data', function (data) {
			logger.log(data.toString());
		});

		cmd.on('exit', function (code) {
			logger.log('password set exited with code ' + code.toString());
			socket.emit('set password response', code.toString());
		});

		cmd.on('error', (err) => {
			logger.log('Failed to start child process.');
			logger.log(err.toString());
		});
	});

	socket.on('restart WL driver', function(data) {
		var cmd = child_process.exec('screen -X -S wldriver quit', function(error, stdout, stderr) {
			logger.log('Stop waterlinked driver:', error, stdout, stderr);
			var args = '';
			if (data.ip) {
				args += ' --ip=' + data.ip;
			}
			if (data.port) {
				args += ' --port=' + data.port;
			}
			child_process.exec('screen -dm -S wldriver ' + _companion_directory + '/tools/underwater-gps.py' + args, function(error, stdout, stderr) {
				logger.log('Start waterlinked driver:', error, stdout, stderr);
			});
		});
	});
	
	socket.on('reboot', function(data) {
		logger.log('reboot');
		child_process.exec('sudo reboot now', function (error, stdout, stderr) {
			logger.log(stdout + stderr);
		});
	});
	
	socket.on('shutdown', function(data) {
		logger.log('shutdown');
		child_process.exec('sudo shutdown -h now', function (error, stdout, stderr) {
			logger.log(stdout + stderr);
		});
	});
	
	var uploader = new SocketIOFile(socket, {
		// uploadDir: {			// multiple directories 
		// 	music: 'data/music', 
		// 	document: 'data/document' 
		// },
		uploadDir: '/tmp/data',	// simple directory 
		chunkSize: 10240,		// default is 10240(1KB) 
		transmissionDelay: 0,	// delay of each transmission, higher value saves more cpu resources, lower upload speed. default is 0(no delay) 
		overwrite: true 		// overwrite file if exists, default is true. 
	});
	uploader.on('start', (fileInfo) => {
		logger.log('Start uploading');
		logger.log(fileInfo);
	});
	uploader.on('stream', (fileInfo) => {
		logger.log(`${fileInfo.wrote} / ${fileInfo.size} byte(s)`);
	});
	uploader.on('complete', (fileInfo) => {
		logger.log('Upload Complete.');
		logger.log(fileInfo);
	});
	uploader.on('error', (err) => {
		logger.log('Error!', err);
	});
	uploader.on('abort', (fileInfo) => {
		logger.log('Aborted: ', fileInfo);
	});

});
