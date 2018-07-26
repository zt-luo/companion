var v4l2camera = require("v4l2camera");
var fs = require("fs");
var logger = require('tracer').console();
const child_process = require('child_process');
var home_dir = process.env.HOME
var _cameras = []
var _activeFormat 
var _profiles = {};
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

	_cameras : _cameras,
	_activeFormat : _activeFormat,
	_profiles : _profiles,
	old_cameras : old_cameras,	
};
