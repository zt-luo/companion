
//CAMERA PAGE

var v4l2camera = require("v4l2camera");
var fs = require("fs");
var logger = require('tracer').console();
const child_process = require('child_process');
var home_dir = process.env.HOME

// This holds all of the cameras/settings detected at start, and that are currently in use, we need to update this every time we modify the camera setttings
var _cameras = []

//This holds the current frame size, frame rate, video device, and video format
//These settings are passed to the video streaming application, and are used by
//gstreamer v4l2src element. The v4l2src element needs to call the appropriate ioctls,
//so we don't do that in this application.
var _activeFormat 

//This holds the user created camera/streaming profiles
var _profiles = {};

//This holds all of the last used/known settings from previous run
var old_cameras = []

const camera_settings_path = home_dir+"/camera-settings";
var _companion_directory = process.env.COMPANION_DIR;
module.exports = {
	currentformat: function() {	
		try {
			var file_path = "/home/pi/vidformat.param";
			var file_data = fs.readFileSync(file_path).toString();
			var fields = file_data.split("\n");
			_activeFormat = { "frameSize": fields[0] + "x" + fields[1], "frameRate": fields[2], "device": fields[3], "format": "H264" }
		} catch (err) {
			logger.log("error loading video format from file", err);
		}
	},
		
	loadprofiles: function() {	
		// Load saved user camera/streaming profiles
		try {
			var file_path = "/home/pi/camera-profiles";
			_profiles = JSON.parse(fs.readFileSync(file_path).toString());
			logger.log("loading profiles from file", _profiles);
		} catch (err) {
			logger.log("error loading video profiles from file", err);
		}
	},
	
	loadlastsettings: function() {
		// Load the last known camera settings
		try {
			var file_data = fs.readFileSync(camera_settings_path);
			old_cameras = JSON.parse(file_data.toString());
		} catch (err) {
			logger.log("error loading file", err);
		}
	},

	createnewobject: function() {
		// Create camera objects, set all camera settings on all cameras to the
		// last known settings
		for (var i = 0; ;i++) {
			try {
				var cam = new v4l2camera.Camera("/dev/video" + i)
				logger.log("found camera:", i);
		
				// TODO put this in driver layer
				cam.controls.forEach(function(control) {
					if (control.type != "class") {
						control.value = cam.controlGet(control.id); // store all the current values locally so that we can update the frontend
						logger.log("getting control:", control.name, control.type, control.value);
						// HACK, some v4l2 devices report bogus default values that are way beyond
						// min/max range, so we need to record what the default value actually is
						// The cameras that I have seen 
						control.default = control.value;
				
						// HACK, bogus max on rpi cam
						if (control.name == "H264 I-Frame Period" && control.max > 2000000) {
							control.max = 120;
						}
					}
				});
		
				var has_h264 = false;
				cam.formats.forEach(function(format) {
					if (format.formatName == "H264") {
						has_h264 = true;
					}
				});
			
				if (has_h264) {
					_cameras.push(cam);
				}
			} catch(err) { // this is thrown once /dev/video<i> does not exist, we have enumerated all of the cameras
				old_cameras.forEach(function(oldcam) { // Configure cameras to match last known/used settings
					_cameras.forEach(function(cam) {
						if (cam.device == oldcam.device) {
							logger.log("oldcam match:", oldcam.device);
							oldcam.controls.forEach(function(control) {
								logger.log("setting control:", control.name, control.value);
								try {
									cam.controlSet(control.id, control.value);
								} catch (err) {
									logger.log("control set failed");
								}
							});
						}
					});
				});
				break;
			}
		}	
	},

	camerasocket: function(io) {
		logger.log("Entered camera log function");
		io.on ('connection', function(socket) {
			
			
			socket.on('get v4l2 cameras', function(data) {
			logger.log("get v4l2 cameras");
			// Update current control values
			_cameras.forEach(function(cam) {
				// TODO put this in driver layer
				cam.controls.forEach(function(control) {
					if (control.type != "class") {
						logger.log("getting control:", control.name, control.type);
						control.value = cam.controlGet(control.id);
					}
				});
			});
		
			try {
				var file_path = home_dir+"/vidformat.param";
				var file_data = fs.readFileSync(file_path).toString();
				var fields = file_data.split("\n");
			
				_activeFormat = { "frameSize": fields[0] + "x" + fields[1], "frameRate": fields[2], "device": fields[3], "format": "H264" }
						
				socket.emit('v4l2 cameras', {
					"cameras": _cameras,
					"activeFormat": _activeFormat,
					"profiles": _profiles
				});
			} catch(err) {
				logger.log("error reading format file");
			}
			});


			socket.on('set v4l2 control', function(data) {
				logger.log('set v4l2 control:', data);
				_cameras.forEach(function(camera) {
					if (camera.device == data.device) {
						try {
							camera.controlSet(data.id, data.value); // set the control
							camera.controls.forEach(function(control) {
								if (control.id == data.id) {
									logger.log("found match");
									control.value = data.value; // update current value in use
								}
							});
					
					
							// Save current settings for reload on next boot					
							fs.writeFile(camera_settings_path, JSON.stringify(_cameras, null, 2), function(err) {
								if(err) {
									logger.log(err);
								}
								logger.log("The file was saved!", camera_settings_path);
							});
						} catch (err) {
							logger.log("error setting control", err);
						}
					}
				});
			});

			
			socket.on('delete v4l2 profile', function(data) {
				logger.log("delete v4l2 profile", data);
		
				_profiles[data] = undefined; // delete the profile
		
				// save updated profiles list to file
				logger.log("Writing profiles to file", _profiles);

				try {
					file_path = home_dir+"/camera-profiles";
					fs.writeFileSync(file_path, JSON.stringify(_profiles, null, 2));
				} catch (err) {
					logger.log("Error writing profile to file");
				}
		
		
				// Update frontend
				socket.emit('v4l2 cameras', {
					"cameras": _cameras,
					"activeFormat": _activeFormat,
					"profiles": _profiles
				});
			});

			
			socket.on('save v4l2 profile', function(data) {
				logger.log("save v4l2 profile");
				try {
					// Load gstreamer settings to use in this profile
					var file_path = home_dir+"/vidformat.param";
					var file_data = fs.readFileSync(file_path).toString();
					var fields = file_data.split("\n");
	
					var profile = { "width": fields[0], "height" : fields[1], "frameRate": fields[2], "device": fields[3], "format": "H264", "controls": {} }
			
					// Load v4l2 controls to use in this profile
					_cameras.forEach(function(camera) {
						if (camera.device == profile.device) {
							camera.controls.forEach(function(control) {
								if (control.type != "class") {
									logger.log("saving control", control.name, control.id);
									profile.controls[control.id] = { "name": control.name, "value": camera.controlGet(control.id) };
								}
							});
						}
					});
			
					// Save the profile
					_profiles[data] = profile;
			
					logger.log("Writing profiles to file", _profiles);
			
					file_path = home_dir+"/camera-profiles";
					fs.writeFileSync(file_path, JSON.stringify(_profiles, null, 2));
				} catch (err) {
					logger.log("Error writing profile to file");
				}
		
				// Update frontend
				socket.emit('v4l2 cameras', {
					"cameras": _cameras,
					"activeFormat": _activeFormat,
					"profiles": _profiles,
					"activeProfile": data
				});
			});

			
			socket.on('reset v4l2 defaults', function(data) {
				logger.log("reset v4l2 defaults", data);
				try {
					_cameras.forEach(function(cam) {
						if (cam.device == data) {
							// TODO put this in driver layer
							cam.controls.forEach(function(control) {
								if (control.type != "class") {
									try {
										logger.log("setting control to default", control.name, control.default);
										cam.controlSet(control.id, control.default);
										control.value = cam.controlGet(control.id);
									} catch (err) {
										logger.log(err);
									}
								}
							});
						}
					});
			
					// Read back current values
					_cameras.forEach(function(cam) {
						// TODO put this in driver layer
						cam.controls.forEach(function(control) {
							if (control.type != "class") {
								logger.log("getting control:", control.name, control.type);
								try {
									control.value = cam.controlGet(control.id);
								} catch(err) {
									logger.log("error getting control", err);
								}
							}
						});
					});
			
					// Save current settings
					fs.writeFile(camera_settings_path, JSON.stringify(_cameras, null, 2), function(err) {
						if(err) {
							logger.log(err);
						}
						logger.log("The file was saved!", camera_settings_path);
					});
				} catch (err) {
					logger.log("error resetting v4l2 defaults", err);
				}
		
				// Update frontend
				socket.emit('v4l2 cameras', {
					"cameras": _cameras,
					"activeFormat": _activeFormat,
					"profiles": _profiles
				});	
			});
			/* a profile looks like this:
			profileName : {
				device : "/dev/video0",
				format : "H264",
				width : 1920,
				height : 1080,
				frameRate : 30,
				controls : {
					101: {
						name: Brightness,
						value: 50
					},
					102: {
						name: Hue,
						value: 50
					}
				}
			}
			*/
			
			
			socket.on('load v4l2 profile', function(data) {
				logger.log("load v4l2 profile", data);
		
				var profile = _profiles[data];
		
				if (!profile) {
					logger.log("profile doesn't exist!", data);
					return;
				}
		
				try {
					////// Set format, restart camera ////////
					_cameras.forEach(function(camera) {
						if (camera.device == profile.device) {
							camera.activeFormat = { 
								"format": profile.format,
								"width": profile.width,
								"height": profile.height,
								"denominator": profile.frameRate
							}
					
						}
					})
			
					logger.log(_companion_directory + '/scripts/restart_video.sh' + ' ' + profile.width + ' ' + profile.height + ' ' + profile.frameRate + ' ' + profile.device);
			
					var cmd = child_process.spawn(_companion_directory + '/scripts/restart_video.sh', [profile.width, profile.height, profile.frameRate, profile.device], {
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
						logger.log('start video exited with code ' + code.toString());
						try {
							////// Set v4l2 controls //////
							_cameras.forEach(function(camera) {
								if (camera.device == profile.device) {
									for (var control in profile.controls) {
										try {
											logger.log("setting control", profile.controls[control].name, profile.controls[control].value);
											camera.controlSet(control, profile.controls[control].value);
											camera.controls.forEach(function(ctrl) {
												if (ctrl.id == control.id) {
													ctrl.value = profile.controls[control].value;
												}
											});
										} catch (err) {
											logger.log("error setting control", err);
										}
									}
								}
							});
					
							// Read back current values
							_cameras.forEach(function(cam) {
								// TODO put this in driver layer
								cam.controls.forEach(function(control) {
									if (control.type != "class") {
										logger.log("getting control:", control.name, control.type);
										try {
											control.value = cam.controlGet(control.id);
										} catch(err) {
											logger.log("error getting control", err);
										}
									}
								});
							});
					
							// Save current settings
							fs.writeFile(camera_settings_path, JSON.stringify(_cameras, null, 2), function(err) {
								if(err) {
									logger.log(err);
								}
								logger.log("The file was saved!", camera_settings_path);
							});
						} catch (err) {
							logger.log("Error setting v4l2 controls:", err);
						}
				
						try {
							////// Update frontend //////
							// Re-load file/activeFormat
							var file_path = home_dir+"/vidformat.param";
							var file_data = fs.readFileSync(file_path).toString();
							var fields = file_data.split("\n");
					
							_activeFormat = { "frameSize": fields[0] + "x" + fields[1], "frameRate": fields[2], "device": fields[3], "format": "H264" }
					
							logger.log("updating frontend", _activeFormat);
							socket.emit('v4l2 cameras', {
								"cameras": _cameras,
								"activeFormat": _activeFormat,
								"profiles": _profiles,
								"activeProfile": data
							});
					
							socket.emit('video up');
						} catch (err) {
							logger.log("error updating frontend", err);
						}
					});
			
					cmd.on('error', (err) => {
						logger.log('Failed to start video child process.');
						logger.log(err.toString());
					});
			
				} catch(err) {
					logger.log("Error setting v4l2 format:", err);
				}
			});


			// Set v4l2 streaming parameters
			// This requires the video streaming application to be restarted
			// The video streaming application needs to call the appropriate v4l2 ioctls, so we don't do it here
			socket.on('set v4l2 format', function(data) {
				try {
					logger.log('set v4l2 format', data);
			
					_cameras.forEach(function(camera) {
						if (camera.device == data.id) {
							camera.activeFormat = { 
								"format": data.format,
								"width": data.width,
								"height": data.height,
								"denominator": data.interval.denominator
							}
					
						}
					})
			
					_activeFormat = { "frameSize": data.width + "x" + data.height, "frameRate": data.interval.denominator, "device": data.id, "format": "H264" }
			
					logger.log(_companion_directory + '/scripts/restart_video.sh' + ' ' + data.width + ' ' + data.height + ' ' + data.interval.denominator + ' ' + data.id);
			
					var cmd = child_process.spawn(_companion_directory + '/scripts/restart_video.sh', [data.width, data.height, data.interval.denominator, data.id], {
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
						logger.log('start video exited with code ' + code.toString());
						socket.emit('video up');
					});
			
					cmd.on('error', (err) => {
						logger.log('Failed to start video child process.');
						logger.log(err.toString());
					});
			
					// Save current settings
					fs.writeFile(camera_settings_path, JSON.stringify(_cameras, null, 2), function(err) {
						if(err) {
							logger.log(err);
						}
						logger.log("The file was saved!", camera_settings_path);
					});
			
				} catch(err) {
					logger.log("Error setting v4l2 format:", err);
				}
			});


			socket.on('update gstreamer', function(data) {
				logger.log("update gstreamer");
				var params = data;
				try {
					if (!params) {
						params = fs.readFileSync(_companion_directory + "/params/gstreamer2.param.default");
					}
			
					var file_path = home_dir+"/gstreamer2.param";
					fs.writeFileSync(file_path, params);
			
					var cmd = child_process.spawn(_companion_directory + '/scripts/restart_video.sh', {
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
						logger.log('start video exited with code ' + code.toString());
						socket.emit('video up');
					});
			
					cmd.on('error', (err) => {
						logger.log('Failed to start video child process.');
						logger.log(err.toString());
					});
			
				} catch(err) {
					logger.log("Error updating gstreamer pipeline:", err);
				}
			});

		});
	},		
};
