
// NETWORK PAGE

var express = require('express');
var app = express();
var logger = require('tracer').console();
const child_process = require('child_process');
var home_dir = process.env.HOME
var _companion_directory = process.env.COMPANION_DIR;

module.exports = function (io){

	return {
		networksocket : function() {
			var networking = io.of('/networking');
			networking.on('connection', function(socket) {
				socket.on('join network', function(data) {
					logger.log('join network');
		
					try {
						var passphrase = child_process.execSync("wpa_passphrase '" + data.ssid + "' '" + data.password + "'");
			
						var networkString = passphrase.toString();
						networkString = networkString.replace(/\t#.*\n/g, ''); // strip unencrypted password out
						networkString = networkString.replace(/"/g, '\\"'); // escape quotes
			
						logger.log(networkString);
			
						// Restart the network in the callback
						cmd = child_process.exec("sudo sh -c \"echo '" + networkString + "' > /etc/wpa_supplicant/wpa_supplicant.conf\"", function (error, stdout, stderr) {
							logger.log("sudo sh -c \"echo '" + networkString + "' > /etc/wpa_supplicant/wpa_supplicant.conf\" : ", error + stdout + stderr);
							var cmd = child_process.exec('sudo ifdown wlan0 && sudo ifup wlan0', function (error, stdout, stderr) {
								logger.log("restarting network");
								logger.log(error + stdout + stderr);
								socket.emit('join complete');
							});
						}); 
					} catch (e) {
						logger.error(e);
						socket.emit('join complete');
					}
				});

		
				// Network setup
				socket.on('get wifi aps', function() {
					logger.log("get wifi aps");
					try {
						var cmd = child_process.execSync('sudo wpa_cli scan');
						logger.log("sudo wpa_cli scan : ", cmd.toString());
					} catch (e) {
						logger.error("wpa_cli scan failed!", e.stderr.toString(), e);
			
						logger.log("WiFi scan failed, attempting to repair configuration....");
						logger.log("Fetching current contents....");
						cmd = child_process.execSync("sudo cat /etc/wpa_supplicant/wpa_supplicant.conf");
						logger.log(cmd.toString());
			
						logger.log("Bringing down wlan0....");
						cmd = child_process.execSync("sudo ifdown wlan0");
						logger.log(cmd.toString());
			
						logger.log("Writing over config....");
						cmd = child_process.execSync("sudo sh -c 'echo > /etc/wpa_supplicant/wpa_supplicant.conf'");
						logger.log(cmd.toString());
			
						logger.log("Bringing wlan0 up....");
						cmd = child_process.execSync("sudo ifup wlan0");
						logger.log(cmd.toString());
			
						return;
					}
		
					try {
						cmd = child_process.execSync('sudo wpa_cli scan_results | grep PSK | cut -f5 | grep .');
						logger.log("wpa_cli scan_results: ", cmd.toString());
						socket.emit('wifi aps', cmd.toString().trim().split("\n"));
					} catch (e) {
						logger.error("wpa_cli scan_results failed!", e.stderr.toString(), e);
					}
				});

		
				socket.on('get wifi status', function() {
					logger.log("get wifi status");
					var cmd = child_process.exec('sudo wpa_cli status', function (error, stdout, stderr) {
						logger.log("sudo wpa_cli status : ", error + stdout + stderr);
						if (error) {
							socket.emit('wifi status', '<h4 style="color:red;">Error: ' + stderr + '</h1>');
						} else {
							if (stdout.indexOf("DISCONNECTED") > -1) {
								socket.emit('wifi status', '<h4 style="color:red;">Disconnected</h1>');
							} else if (stdout.indexOf("SCANNING") > -1) {
								socket.emit('wifi status', '<h4 style="color:red;">Scanning</h1>');
							} else if (stdout.indexOf("INACTIVE") > -1) {
								socket.emit('wifi status', '<h4 style="color:red;">Inactive</h1>');
							} else {
								var fields = stdout.split("\n");
								for (var i in fields) {
									line = fields[i].split("=");
									if (line[0] == "ssid") {
										var ssid = line[1];
									} else if (line[0] == "ip_address") {
										var ip = " (" + line[1] + ")";
									}
								}
					
								if (stdout.indexOf("HANDSHAKE") > -1) {
									socket.emit('wifi status', '<h4>Connecting: ' + ssid + '</h1>');
								} else {
									var ipString = ""
									if (ip != undefined) {
										ipString = ip
									}
						
									var ssidString = ""
									if (ssid != undefined) {
										ssidString = ssid
									}
						
									socket.emit('wifi status', '<h4 style="color:green;">Connected: ' + ssidString + ipString + '</h4>');
								}
							}
						}
					});
				});
			});
		},
	
		networksocketio: function() { 
			io.on ('connection',function(socket) {			

				socket.on('get current ip', function() {
					logger.log("get current ip");

					child_process.exec("ifconfig | grep -A 1 'eth0' | tail -1 | cut -d ':' -f 2 | cut -d ' ' -f 1", function (error, stdout, stderr) {
						if(!error) {
							socket.emit('current ip', stdout);
						};
					});

				});

				// used for ethernet configuration
				socket.on('set default ip', function(ip) {
					logger.log("set default ip", ip);

					child_process.exec(home_dir+'/companion/scripts/set_default_client_ip.sh ' + ip, function (error, stdout, stderr) {
						logger.log(stdout + stderr);
					});

				});
	
			});
		},

		updateInternetStatus: function(should_log) {

			var cmd = child_process.exec('ping -c1 google.com', function (error, stdout, stderr) {
				if (should_log) {
					logger.log("ping -c1 google.com : ", error + stdout + stderr);
				}
				if (error) {
					_internet_connected = false;
				} else {
					_internet_connected = true;
				}
				io.emit('internet status', _internet_connected);
			});
		},
	}
};
