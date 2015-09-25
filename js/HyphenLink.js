//
//  HyphenLink.js
//  HyphenLink JS Library 1.0
//	For Hyphen Reader 1.0
//
//  Created by Matt Curtis
//  Copyright (c) 2015. All rights reserved.
//

(function(global){

	//	----------------
	//	GLOBAL VARIABLES
	//	----------------

	var _lib = {};
	var _version = "1.0";
	var _ip;


	//	---------
	//	CONSTANTS
	//	---------

	//	Ports

	_lib.WEB_SERVER_PORT = 9090;
	_lib.WEB_SOCKET_PORT = 8080;

	//	Notifications

	_lib.NOTIFICATION_BOOKS_DID_UPDATE = "BOOKS_DID_UPDATE";
	_lib.NOTIFICATION_IMPORT_STATUS_UPDATE = "IMPORT_STATUS_UPDATE";


	//	----------
	//	WEB SERVER
	// 	----------

	var RestAPI = new function(){
		var _self = this;

		//	---------
		//	UTILITIES
		//	---------

		var queryStringFromObject = function(obj){
			var queryPairs = [];

			for(var key in obj){
				queryPairs.push(key+"="+escape(obj[key]));
			}

			return queryPairs.join("&");
		};

		var generateUUID = function(){
			var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c){
				var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
				
				return v.toString(16);
			});

			return uuid.toUpperCase();
		};

		var formDataFromObject = function(obj){
			var formData = new FormData();

			for(var key in obj) formData.append(key, obj[key]);

			return formData;
		};

		_self.getURLForEndPoint = function(endPoint, queryObject){
			var url = "http://"+_ip+":"+_lib.WEB_SERVER_PORT+endPoint;

			if(queryObject) url += "?"+queryStringFromObject(queryObject);

			return url;
		};

		 _self.makeRequest = function(method, endPoint, queryObject, formDataObject, responseType){
			var callbacks = {};

			//	Query

			if(!queryObject) queryObject = {};

			queryObject["_ran"] = generateUUID();

			//	Create Request

			var req = new XMLHttpRequest();

			var url = _self.getURLForEndPoint(endPoint, queryObject);

			req.responseType = responseType || "json";

			req.open(method, url);

			//	Add Event Handlers

			req.onload = function(e){
				//	Callbacks

				var response = req.response;

				if(callbacks.onSuccess) callbacks.onSuccess(e, response);
			};

			req.onprogress = function(e){
				if(!e.lengthComputable) return;
				
				//	This will never be fired, as HyphenLink gzips all responses,
				//	and removes the Content-Length header.
				
				if(callbacks.onProgress) callbacks.onProgress(e, percent, e.loaded, e.total);
			};

			req.error = function(e){
				if(callbacks.onFailure) callbacks.onFailure(e);
			};

			//	Send Request

			var toSend;

			if(formDataObject) toSend = formDataFromObject(formDataObject);

			req.send(toSend);

			return callbacks;
		};
	};

	_lib.RestAPI = RestAPI;


	//	----------
	//	WEB SOCKET
	//	----------

	var Socket = new function(){
		var self = this;

		var notificationListeners = {};

		//	Create Socket

		var socket;

		this.open = function(clientName, socketOpenCallback){
			//	Close existing socket

			if(socket) socket.close();
			socket = null;

			//	Try to establish connection...

			var didOpen = false;
			var socketURL = "ws://"+_ip+":"+_lib.WEB_SOCKET_PORT;

			if(clientName) socketURL += "?clientName="+clientName;

			console.log("Attempting to connect to socket with URL:", socketURL);

			try {
				socket = new WebSocket(socketURL);
			} catch(err){
				console.log("Error thrown while opening socket:", err);

				if(socketOpenCallback) socketOpenCallback(false);
			}

			if(!socket) return;

			//	Event Handlers

			socket.onmessage = function(e){
				var notification = JSON.parse(e.data);

				//	Find listeners for this notification type
				
				for(var type in notificationListeners){
					if(type != notification.type && type != "*") continue;

					var callbacks = notificationListeners[type];

					if(!callbacks) continue;

					for(var i = 0, len = callbacks.length; i<len; i++){
						var callback = callbacks[i];

						//	Call handler

						callback(notification);
					}
				}
			};

			socket.onopen = function(e){
				didOpen = true;

				console.log(e);

				if(socketOpenCallback) socketOpenCallback(true);
			};

			socket.onclose = function(e){
				console.log(e);

				if(socketOpenCallback && !didOpen) socketOpenCallback(false);

				if(self.onClose) self.onClose();
			};

			socket.onerror = function(e){
				console.log(e);

				if(self.onError) self.onError();
			};
		};

		this.send = function(object){
			socket.send(JSON.stringify(object));
		};

		this.close = function(){
			socket.close();
		};

		this.addNotificationListener = function(type, callback, once){
			if(!notificationListeners[type]) notificationListeners[type] = [];

			var wrappedCallback = function(notification){
				callback(notification);

				if(once) remove();
			};

			var remove = function(){
				var listeners = notificationListeners[type];

				for(var i = 0, len = listeners.length; i<len; i++){
					if(listeners[i] === wrappedCallback){
						listeners.splice(i, 1); break;
					}
				}
			};

			notificationListeners[type].push(wrappedCallback);
			
			return { remove: remove };
		};

		//	----------
		//	PROPERTIES
		//	----------

		Object.defineProperty(this, "socket", {
			get: function(){
				return socket;
			},

			enumerable: true
		});

		Object.defineProperty(this, "isConnecting", {
			get: function(){
				return (socket && socket.readyState == 0);
			},

			enumerable: true
		});

		Object.defineProperty(this, "isLive", {
			get: function(){
				return (socket && socket.readyState == 1);
			},

			enumerable: true
		});
	};

	_lib.Socket = Socket;


	//	Connect & Disconnect

	_lib.connect = function(ip, clientName, connectionCallback){
		_ip = ip;

		Socket.open(clientName, connectionCallback);
	};

	_lib.disconnect = function(){
		Socket.close();
	};

	Object.defineProperty(_lib, "isConnected", {
		get: function(){
			return Socket.isLive;
		},

		enumerable: true
	});


	//	---------------
	//	HyphenLink APIs
	//	---------------

	//	Books

	var Books = new function(){

		//	Constants

		var BOOK_ID_KEY = "bookId";
		var BOOK_IDS_KEY = "bookIds";

		//	Get Books

		this.getBooks = function(ids, callback){
			//	Arguments

			if(arguments.length == 1){
				callback = ids; ids = null;
			}

			//	Perform request

			var query = {};

			if(ids && ids.length > 0) query[BOOK_IDS_KEY] = ids.join(",");

			RestAPI.makeRequest("GET", "/books", query).onSuccess = function(e, json){
				if(callback) callback(json);
			};
		};

		//	Book Cover

		this.getURLForBookCover = function(id){
			var query = {}; query[BOOK_ID_KEY] = id;

			return RestAPI.getURLForEndPoint("/book/cover", query);
		};

		//	Book Thumb

		this.getURLForBookThumb = function(id){
			var query = {}; query[BOOK_ID_KEY] = id;

			return RestAPI.getURLForEndPoint("/book/thumb", query);
		};

		//	ePub

		this.getURLForBookEpub = function(id){
			var query = {}; query[BOOK_ID_KEY] = id;

			return RestAPI.getURLForEndPoint("/book/epub", query);
		};

		//	Update Books

		this.updateBooks = function(ids, changes, callback){
			var formData = changes;

			if(ids && ids.length > 0) formData[BOOK_IDS_KEY] = ids.join(",");

			RestAPI.makeRequest("POST", "/books/update", null, formData).onSuccess = function(e, json){
				if(callback) callback(json);
			};
		};

		//	Update Covers for Books

		this.updateCoversOfBooks = function(ids, coverBlob, callback){
			var formData = { cover: coverBlob };

			formData[BOOK_IDS_KEY] = ids.join(",");

			RestAPI.makeRequest("POST", "/books/update_cover", null, formData).onSuccess = function(e, json){
				if(callback) callback(json);
			};
		};

		//	Import ePubs

		this.importEpubs = function(epubBlobs, callback){
			var pending = epubBlobs.length;

			for(var i = 0, len = epubBlobs.length; i<len; i++){
				var formData = { "epub": epubBlobs[i] };

				RestAPI.makeRequest("POST", "/books/import", null, formData).onSuccess = function(e, json){
					callback(json);
				};
			}
		};

		//	Delete Books

		this.deleteBooks = function(ids, callback){
			var formData = {};

			formData[BOOK_IDS_KEY] = ids.join(",");

			RestAPI.makeRequest("POST", "/books/delete", null, formData).onSuccess = function(e, json){
				if(callback) callback(json);
			};
		};
	};

	_lib.Books = Books;


	//	Assign Library to Global

	global.HyphenLink = _lib;

})(window);