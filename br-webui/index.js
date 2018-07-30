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
var networking = io.of('/networking');
var gitsetup = io.of('/gitsetup');


///////////////////////////////////////////////////////////////
////////////////   Git setup functions   //////////////////////
///////////////////////////////////////////////////////////////

var Git = require('nodegit');
var gitnew = require('./git.js')(io);

var _current_HEAD = gitnew._current_HEAD;

//hack/workaround for remoteCallback spinlock
var _authenticated = gitnew._authenticated;

// We store all of the remote references in this format:
//var _refs = {
//	'remotes' :  {
//		
//		'upstream' : {
//			'url' : https://github.com... ,
//			'authenticated : false,
//			'branches' : [],
//			'tags'     : []
//		},
//		
//		'origin' : {
//			'url' : https://github.com... ,
//			'authenticated : true,
//			'branches' : [],
//			'tags'     : []
//		}
//	}
//}

var _refs = gitnew._refs;


var companionRepository = gitnew.companionRepository;


Git.Repository.open(_companion_directory)
	.then(function(repository) {
		companionRepository = repository;
		gitnew.updateHEAD(companionRepository);
		emitRemotes();
	})
	.catch(function(err) { logger.log(err); });

//Set up fetch options and credential callback
var fetchOptions = new Git.FetchOptions();
var remoteCallbacks = new Git.RemoteCallbacks();

// So there's this crazy thing where nodegit gets stuck in an infinite callback loop here if
// we return sshKeyFromAgent, and we do not actually have valid credentials stored in the agent.
// There is no public method to check if the credentials are valid before returning them.
// So we return sshKeyFromAgent the first time, and if we get called again immediately after with
// the same request, we assume it is the bug and return defaultNew to break the loop.
var requests = {};

remoteCallbacks.credentials = function(url, userName) {
	logger.log('credentials required', url, userName);
	var id = userName + "@" + url;
	
	if (requests[id]) {
		return Git.Cred.defaultNew();
	}
	requests[id] = true;
	setTimeout(function() {
		requests[id] = false;
		console.log(requests);
	}, 500);

	
	return Git.Cred.sshKeyFromAgent(userName);
}

fetchOptions.callbacks = remoteCallbacks;
fetchOptions.downloadTags = 1;

// Fetch and parse remote references, add them to our list
// Emit our list after each remote's references are parsed
function formatRemote(remoteName) {
	// Add new remote to our list
	var newRemote = {
			'url' : '',
			'branches' : [],
			'tags' : [],
			'authenticated' :  false
		}
	_refs.remotes[remoteName] = newRemote;
	
	return companionRepository.getRemote(remoteName)
		.then(function(remote) {
			newRemote.url = remote.url();
			logger.log('connecting to remote', remote.name(), remote.url());
			return remote.connect(Git.Enums.DIRECTION.FETCH, remoteCallbacks)
			.then(function(errorCode) {
				// Get a list of refs
				return remote.referenceList()
				.then(function(promiseArrayRemoteHead) {
					// Get the name of each ref, determine if it is a branch or tag
					// and add it to our list
					newRemote.authenticated = true;
					promiseArrayRemoteHead.forEach(function(ref) {
						var branch
						var tag
						var oid = ref.oid().tostrS().substring(0,8);
						if (branch = ref.name().split('refs/heads/')[1]) {
							var newRef = [branch, oid]
							_refs.remotes[remoteName].branches.push(newRef);
						} else if (tag = ref.name().split('refs/tags/')[1]) {
							var newRef = [tag, oid]
							_refs.remotes[remoteName].tags.push(newRef);
						}
					});
				})
				.catch(function(err) { logger.log(err); });
			})
			.catch(function(err) {
				logger.log("Error connecting to remote", remote.name(), err); 
			});
		})
		.catch(function(err) { logger.log(err); });
}


// Fetch, format, emit the refs on each remote
function formatRemotes(remoteNames) {
	logger.log('formatRemotes', remoteNames);
	
	var promises = [];
	
	remoteNames.forEach(function(remote) {
		promises.push(formatRemote(remote));
	});
	
	// callback for when all async operations complete
	return Promise.all(promises)
	.then(function() {
		io.emit('refs', _refs);
	});
}


// Get all remote references, compile a formatted list, and update frontend
function emitRemotes() {
	if (companionRepository == null) {
		return;
	}
	
	_refs = { 'remotes' : {} };
	
	gitnew.updateHEAD(companionRepository);
	
	companionRepository.getRemotes()
		.then(formatRemotes)
		.catch(function(err) { logger.log(err); });
}


// Not used
// fetch a remote by name
function fetchRemote(remote) {
	logger.log('fetching', remote);
	companionRepository.fetch(remote, fetchOptions)
		.then(function(status) {
			logger.log('fetch success', status);
		})
		.catch(function(status) {
			logger.log('fetch fail', status);
		});
}


// Checkout a reference object
function checkout(reference) {
	logger.log('reference', reference.name());
	companionRepository.checkoutRef(reference)
		.catch(function(err) { logger.log(err); });
}

///////////////////////////////////////////////////////////////
////////////////  ^Git setup functions^  //////////////////////
///////////////////////////////////////////////////////////////


gitsetup.on('connection', function(socket) {
	// Populate frontend reference list
	emitRemotes(companionRepository);
	
	// Request to checkout remote reference
	socket.on('checkout with ref', function(data) {
		var referenceName = '';
		
		if (data.branch) {
			referenceName = data.remote + "/" + data.branch;
		} else if (data.tag) {
			// TODO delete tag and fetch first
			referenceName = data.tag;
		}
		
		// Get reference object then checkout
		companionRepository.getReference(referenceName)
		.then(checkout)
		.catch(function(err) {
			logger.log(err);
			socket.emit('git error', err);
		});
	});
	
	// Request to run companion update scripts to update
	// to target reference
	socket.on('update with ref', function(data) {
		
		var arg1 = data.remote;
		var arg2 = '';
		var arg3 = '';
		var arg4 = '';
		
		if (data.copyOption) {
			arg4 = data.copyOption;
			console.log('ARG 4', arg4);
		}
		
		if (data.branch) {
			arg2 = data.branch;
		} else if (data.tag) {
			// TODO delete tag and fetch first
			arg3 = data.tag;
		}
		
		var args = [arg1, arg2, arg3, arg4];
		
		// system setup
		logger.log("update companion with ref", args);
		var cmd = child_process.spawn(_companion_directory + '/scripts/update.sh', args, {
			detached: true
		});

		// Ignore parent exit, we will restart this application after updating
		cmd.unref();
		
		cmd.stdout.on('data', function (data) {
			logger.log(data.toString());
			
			socket.emit('terminal output', data.toString());
			if (data.indexOf("Update Complete, refresh your browser") > -1) {
				socket.emit('companion update complete');
			}
		});
		
		cmd.stderr.on('data', function (data) {
			logger.error(data.toString());
			socket.emit('terminal output', data.toString());
		});
		
		cmd.on('exit', function (code) {
			logger.log('companion update exited with code ' + code.toString());
			socket.emit('companion update complete');
		});
		
		cmd.on('error', (err) => {
			logger.error('companion update errored: ', err.toString());
		});
	});
	
	// Fetch all remotes and update
	socket.on('fetch', function(data) {
		logger.log('fetching remotes');
		companionRepository.fetchAll(fetchOptions)
			.then(emitRemotes)
			.catch(function(err) {
				logger.log(err);
				socket.emit('git error', err);
			});
	});
	
	// Get credentials from frontend, authenticate and update
	socket.on('credentials', function(data) {
		logger.log("git credentials");
		
		console.log(_refs);
		console.log(data);
		if (!_refs.remotes[data.remote]) {
			logger.log("no matching ref", data.name);
			return;
		}
		if (_refs.remotes[data.remote].url.indexOf("ssh://git@github.com") > -1) {
			var cmd = _companion_directory + '/scripts/authenticate-github.sh ' + data.username + ' ' + data.password;
			child_process.exec(cmd, function(err, stdout, stderr) {
				logger.log('Authentication returned ' + err);
				logger.log('stdout:\n' + stdout);
				logger.log('stderr:\n' + stderr);
				emitRemotes();
			});
		}
	});
	
	// Add a remote to the local repository
	socket.on('add remote', function(data) {
		logger.log('add remote', data);
		Git.Remote.create(companionRepository, data.name, data.url)
			.then(function(remote) {
				emitRemotes();
			})
			.catch(function(err) {
				logger.log(err);
				socket.emit('git error', err);
			});
	});
	
	// Add a remote to the local repository
	socket.on('remove remote', function(data) {
		logger.log('remove remote', data);
		Git.Remote.delete(companionRepository, data)
			.then(function(result) {
				logger.log("remove remote result:", result);
				emitRemotes();
			})
			.catch(function(err) {
				logger.log(err);
				socket.emit('git error', err);
			});
	});
});

var networknew = require("./networkpage.js")(io);
networknew.networksocket();

networknew.updateInternetStatus(true);
setInterval(networknew.updateInternetStatus, 2500, false);

var systemnew = require("./system.js")(io);	
// Make updateCPUStats() run once every 5 seconds (=os.loadavg() update rate)
setInterval(systemnew.updateCPUStats, 5000);
setInterval(systemnew.givemav, 4000);

cameranew.camerasocket(io);

systemnew.systemsocket();

var mavnew = require("./mavproxy.js")(io);
mavnew.mavsocket();

io.on('connection', function(socket) {
	
	// used in routing setup
	socket.on('get serial ids', function(data) {
		logger.log("get serial ids");
		var cmd = child_process.exec('ls /dev/serial/by-id/*', function (error, stdout, stderr) {
			logger.log("ls /dev/serial/by-id/* : ", error + stdout + stderr);
			socket.emit('serial ids', stdout);
		});
	});
	
	// used in routing setup
	socket.on('routing request', function(data) {
		logger.log("routing request");
		var sock = dgram.createSocket('udp4');
		var message = new Buffer(JSON.stringify(data));
		sock.send(message, 0, message.length, 18990, '0.0.0.0', function(err, bytes) {
			if (err) {
				logger.error(err);
				throw err;
			}
		});
		
		sock.on('message', (msg, rinfo) => {
			socket.emit('endpoints', msg.toString());
		});

	});

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

	// used for ethernet configuration
	socket.on('set default ip', function(ip) {
		logger.log("set default ip", ip);

		child_process.exec(home_dir+'/companion/scripts/set_default_client_ip.sh ' + ip, function (error, stdout, stderr) {
			logger.log(stdout + stderr);
		});

	});
	
	socket.on('get current ip', function() {
		logger.log("get current ip");

		child_process.exec("ifconfig | grep -A 1 'eth0' | tail -1 | cut -d ':' -f 2 | cut -d ' ' -f 1", function (error, stdout, stderr) {
			if(!error) {
				socket.emit('current ip', stdout);
			};
		});

	});
});
