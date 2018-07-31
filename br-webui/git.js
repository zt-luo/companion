
// GIT SETUP PAGE
var _io;
var Git = require('nodegit');
var _current_HEAD = '';
//hack/workaround for remoteCallback spinlock
var _authenticated = false;
var logger = require('tracer').console();
const child_process = require("child_process");

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

var _refs = { 'remotes' : {} };
var companionRepository = null;
var _companion_directory = process.env.COMPANION_DIR

Git.Repository.open(_companion_directory)
	.then(function(repository) {
		companionRepository = repository;
		updateHEAD(companionRepository);
		emitRemotes();
	})
	.catch(function(err) { logger.log(err); });

function updateHEAD(repository, io) {
		repository.head()
			.then(function(reference) {
				_current_HEAD = reference.target().tostrS().substring(0,8);
				_io.emit('current HEAD', _current_HEAD);
				logger.log('Current HEAD:', reference.target().tostrS().substring(0,8));
			});
}

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
			_io.emit('refs', _refs);
		});
}

// Get all remote references, compile a formatted list, and update frontend
function emitRemotes() {
	if (companionRepository == null) {
		return;
	}
	
	_refs = { 'remotes' : {} };
	
	updateHEAD(companionRepository);
	
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

module.exports = function (io) {
	
	//Giving 'io' locally

	_io = io
	
	return {

		///////////////////////////////////////////////////////////////
		////////////////  ^Git setup functions^  //////////////////////
		///////////////////////////////////////////////////////////////

		gitsocket: function() {
			var gitsetup = io.of('/gitsetup');
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
		},

		_current_HEAD: _current_HEAD,
		_authenticated: _authenticated,
		_refs: _refs,
		companionRepository: companionRepository,
		remoteCallbacks: remoteCallbacks,
		fetchOptions: fetchOptions,
	}
};
