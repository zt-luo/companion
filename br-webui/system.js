
// SYSTEM PAGE

var os = require("os");
const child_process = require('child_process');
var logger = require('tracer').console();
var home_dir = process.env.HOME
var _companion_directory = process.env.COMPANION_DIR;

function getCpuStatus(callback) {
	var cmd = child_process.exec('vcgencmd get_throttled', function (error, stdout, stderr) {
		callback(stdout);
	});
}

module.exports = function (io) {
	return {

		updateCPUStats : function() {
			var cpu_stats = {};

			// report cpu usage stats (divide load by # of cpus to get load)
			cpu_stats.cpu_load	= os.loadavg()[0]/os.cpus().length*100;	 // %

			// report ram stats (raspbian uses 1024 B = 1 KB)
			cpu_stats.ram_free	= os.freemem()/(1024*1024);	 // MB
			cpu_stats.ram_total = os.totalmem()/(1024*1024); // MB
			cpu_stats.ram_used	= cpu_stats.ram_total - cpu_stats.ram_free; // MB

			cpu_stats.cpu_status    = ""
			// Get cpu status
			getCpuStatus(function(status) {
				throttled = status.split("=");

				// If command fail, return no status
				if (throttled[0] != "throttled") {
					cpu_stats.cpu_status = "No status"
					io.emit('cpu stats', cpu_stats);
					return;
				}

				// Decode command
				throttled_code = parseInt(throttled[1])
				var throttled_list =
				[
					{bit: 18, type: "Throttling has occurred"},
					{bit: 17, type: "Arm frequency capped has occurred"},
					{bit: 16, type: "Under-voltage has occurred"},
					{bit: 2, type: "Currently throttled"},
					{bit: 1, type: "Currently arm frequency capped"},
					{bit: 0, type: "Currently under-voltage"}
				];

				for (i = 0; i < throttled_list.length; i++) {
					if ((throttled_code >> throttled_list[i].bit) & 1) {
						if (cpu_stats.cpu_status != "") {
							cpu_stats.cpu_status += ", "
						}
						cpu_stats.cpu_status += throttled_list[i].type
					}
				}

				// stream collected data
				io.emit('cpu stats', cpu_stats);
			})
		},
		
		// Get detailed status processes		

		givemav: function () {
			var procstatus = {};
	
			var cmd = child_process.exec('screen -ls', function (error, stdout, stderr) {
				procstatus.mav = stdout.search("mavproxy") < 0 ? "Not Running" : "Running" ;
				procstatus.vid = stdout.search("video") < 0 ? "Not Running" : "Running" ;
				procstatus.webterm = stdout.search("webterminal") < 0 ? "Not Running" : "Running" ;
				procstatus.aud = stdout.search("audio") < 0 ? "Not Running" : "Running" ;
				procstatus.web = stdout.search("webui") < 0 ? "Not Running" : "Running" ;
				procstatus.filemanager = stdout.search("file-manager") < 0 ? "Not Running" : "Running" ;
				procstatus.router = stdout.search("commrouter") < 0 ? "Not Running" : "Running" ;
				procstatus.nmearx = stdout.search("nmearx") < 0 ? "Not Running" : "Running" ;
				procstatus.driver = stdout.search("wldriver") < 0 ? "Not Running" : "Running" ;
		
				for (var key in procstatus) {
					if (procstatus[key] == "Running") {
						procstatus[key] = procstatus[key].fontcolor("green");
					} else {
						procstatus[key] = procstatus[key].fontcolor("red");
					}
				}
				io.emit('getmav', procstatus);
			});
	
		},

			
		systemsocket: function() {

			io.on('connection', function(socket) {
								
				// Get latest version of companion
				
				socket.on('get companion version', function(data) {
					logger.log('get companion version');
					var cmd = child_process.exec('git describe --tags', function(error, stdout, stderr) {
						logger.log(error + stdout + stderr);
						socket.emit('companion version', stdout + stderr);
					});
				});

				socket.on('get companion latest', function(data) {
					logger.log("get companion latest");
					var cmd = child_process.exec('git tag -d stable >/dev/null; git fetch --tags >/dev/null; git rev-list --left-right --count HEAD...refs/tags/stable | cut -f2', function(error, stdout, stderr) {
						logger.log(error + stdout + stderr);
						if (parseInt(stdout) > 0) {
							socket.emit('companion latest');
						}
					});
				});
	
				// Update companion software
				
				socket.on('update companion', function(data) {
					logger.log("update companion");
					var cmd;
					if (data) {
						logger.log('from file', data);
						cmd = child_process.spawn(_companion_directory + '/scripts/sideload.sh', ['/tmp/data/' + data], {
							detached: true
						});	
					} else {
						var args = ['origin', '', 'stable', 'true']; // remote, branch, tag, copy repo for revert?
						cmd = child_process.spawn(_companion_directory + '/scripts/update.sh', args, {
							detached: true
						});
					}
		
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

				// Updating Pixhawk

				socket.on('update pixhawk', function(data) {
					logger.log("update pixhawk");
					if (data.option == 'dev') {
						// Use spawn instead of exec to get callbacks for each line of stderr, stdout
						var cmd = child_process.spawn(_companion_directory + '/tools/flash_px4.py', ['--latest']);
					} else if (data.option == 'beta') {
						var cmd = child_process.spawn(_companion_directory + '/tools/flash_px4.py', ['--url', 'http://firmware.ardupilot.org/Sub/beta/PX4/ArduSub-v2.px4']);
					} else if (data.option == 'file') {
						var cmd = child_process.spawn(_companion_directory + '/tools/flash_px4.py', ['--file', '/tmp/data/' + data.file]);
					} else {
						var cmd = child_process.spawn(_companion_directory + '/tools/flash_px4.py');
					}
		
					cmd.stdout.on('data', function (data) {
						socket.emit('terminal output', data.toString());
						logger.log(data.toString());
					});
		
					cmd.stderr.on('data', function (data) {
						socket.emit('terminal output', data.toString());
						logger.log(data.toString());
					});
		
					cmd.on('exit', function (code) {
						logger.log('pixhawk update exited with code ' + code.toString());
						socket.emit('pixhawk update complete');
					});
		
					cmd.on('error', (err) => {
						logger.log('Failed to start child process.');
						logger.log(err.toString() + '\n');
					});
				});

				// Restore pixhawk firmware
				
				socket.on('restore px fw', function(data) {
					logger.log("restore px fw");
					var cmd = child_process.spawn('/usr/bin/python', ['-u',
							_companion_directory + '/tools/flash_px4.py',
							'--file', _companion_directory + '/fw/ArduSub-v2.px4']);
					cmd.stdout.on('data', function (data) {
						socket.emit('terminal output', data.toString());
						logger.log(data.toString());
					});

					cmd.stderr.on('data', function (data) {
						socket.emit('terminal output', data.toString());
						logger.log(data.toString());
					});

					cmd.on('exit', function (code) {
						logger.log('pixhawk firmware restore exited with code '
								+ code.toString());
						socket.emit('restore px fw complete');
					});

					cmd.on('error', (err) => {
						logger.log('Failed to start child process.');
						logger.log(err.toString());
						socket.emit('terminal output', err.toString() + '\n');
						socket.emit('restore px fw complete');
					});
				});
				
				// Restore pixhawk factory parameters

				socket.on('restore px params', function(data) {
					logger.log("restore px params");
					var cmd = child_process.spawn('/usr/bin/python', ['-u',
							_companion_directory + '/tools/flashPXParameters.py',
							'--file', _companion_directory + '/fw/standard.params']);

					cmd.stdout.on('data', function (data) {
						socket.emit('terminal output', data.toString());
						logger.log(data.toString());
					});

					cmd.stderr.on('data', function (data) {
						socket.emit('terminal output', data.toString());
						logger.log(data.toString());
					});

					cmd.on('exit', function (code) {
						logger.log('pixhawk parameters restore exited with code '
								+ code.toString());
						socket.emit('restore px params complete');
					});

					cmd.on('error', (err) => {
						logger.log('Failed to start child process.');
						logger.log(err.toString());
						socket.emit('terminal output', err.toString());
						socket.emit('restore px params complete');
					});
				});
				
				// Reboot pixhawk			
		
				socket.on('reboot px', function(data) {
					var bash = "`timeout 5 mavproxy.py --master=/dev/serial/by-id/usb-3D_Robotics_PX4_FMU_v2.x_0-if00 --cmd=\"reboot;\"`&"
					child_process.exec(bash);
					socket.emit('reboot px complete');
				});
			});
		},			
	}	
};
