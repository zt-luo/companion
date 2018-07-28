
// GIT SETUP PAGE

var Git = require('nodegit');
var _current_HEAD = '';
//hack/workaround for remoteCallback spinlock
var _authenticated = false;
var logger = require('tracer').console();

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



module.exports = function (io) {

	return {

		updateHEAD: function(repository) {
			repository.head()
				.then(function(reference) {
					_current_HEAD = reference.target().tostrS().substring(0,8);
					io.emit('current HEAD', _current_HEAD);
					logger.log('Current HEAD:', reference.target().tostrS().substring(0,8));
				});
		},

		_current_HEAD: _current_HEAD,
		_authenticated: _authenticated,
		_refs: _refs,
		companionRepository: companionRepository,
	}
};
