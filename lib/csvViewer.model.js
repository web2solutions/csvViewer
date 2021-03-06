/*
 *
 *   Copyright 2015 by BIG Inventory, Inc. All Rights Reserved.
 *
 */

csvViewer.model = csvViewer.model || (function(){
	'strict';
	var _start = function ( c ){
		var self = this;
		
		connect().then( function( response ) {
		
			if( c.onSuccess ) c.onSuccess(response);
			//alert(response);
		
		}, function(response) {
		 	if( c.onFail ) c.onFail(response);
			//alert(response)	
		
		} );
			
	
	}
	
	, defaultDatabase = 'BigInventory'
	, db = null
	, request = null
	, schema = {}
	
	/**
	* Connects to a database.
	* @method
	* @param {object} dsn - Connection payload
	* var dsn = {
	*	database : 'myDBName'
	* 	onConnect : function(){}
	* 	onUpgrade : function(){}
	* 	onConnectionError : function(){}
	* 	onDbError : function(){}
	* }
	*/
	, connect = function( dsn ){
		dsn = dsn || {};
		
		if( dsn.database )
		{
			defaultDatabase = dsn.database;	
		}
		
		var nversion = new Date().getTime();
		
		if( ! localStorage.getItem("csvViewer.setup") )
		{
			localStorage.setItem("csvViewer.setup.db.version", nversion);
		}
		
		if( localStorage.getItem("csvViewer.setup.db.version") )
		{
			dsn.version = localStorage.getItem("csvViewer.setup.db.version");
		}
		else
		{
			dsn.version = nversion;
			localStorage.setItem("csvViewer.setup.db.version", nversion);
		}
		
		return new Promise( function( resolve, reject ) {
			request = indexedDB.open( defaultDatabase, dsn.version );
			
			request.onerror = function(event) {
			 // alert("Você não habilitou minha web app para usar IndexedDB?!");
			  reject("Você não habilitou minha web app para usar IndexedDB?!");
			};
			
			request.onsuccess = function(event) {
				db = request.result;
				//console.log('onsuccess');
				setDbGenericErrorHandler();
				
				resolve('connected');
			};
			
			request.onupgradeneeded = function(event) { 
				db = event.target.result;
				//console.log('onupgradeneeded');
				setDbGenericErrorHandler();		
				
				_createTables({
					db : event.target.result
				 	, onSuccess : function(){
						if( dsn.onUpgrade ) dsn.onUpgrade();
					}
				 	, onFail : function(){
						//reject("Couldn't create table !");
					}
					, resolve : resolve
					, reject : reject
				})
			};
		})	
	}
	
	, _addRecords = function(c){
		try
		{
			var items = c.records,
			i = 0, 
			ii =0,
			putNext = function() {
				if (i<items.length) {
					var request = objectStore.add(items[i]);
					request.onsuccess = function(event) {
						++i;
						++ii;
						csvViewer.view.setup.status_bar.setText('importing record: ' + ii);
						putNext();
					};
					request.onerror = function(event) {
						console.log( event );
					};
				}
				else
				{
					csvViewer.view.setup.status_bar.setText('finishing db transaction');
					csvViewer.view.setup.container.innerHTML += '<br>finishing db transaction<br>';	
				}
			},
			transaction = db.transaction('inventory', "readwrite"),
			objectStore = transaction.objectStore("inventory");
						
			transaction.oncomplete = function (event) {
				
				localStorage.setItem("csvViewer.setup", 'done');			
				csvViewer.view.setup.container.innerHTML = "<br>populate complete! <br><br>Total records: " 
						+ ii + "<br>" + csvViewer.view.setup.container.innerHTML;
						
				csvViewer.view.setup.status_bar.setText('Done!');
				csvViewer.view.setup.container.innerHTML = "<br>Setup done!<br>" + csvViewer.view.setup.container.innerHTML;
				
				if( c.onSuccess ) c.onSuccess();
	
				dhtmlx.alert('Setup is done! <br> Starting application in 2 seconds, please wait ... ');
				
				window.setTimeout(function(){
					csvViewer.view.setup.window.close();
					csvViewer.view.render();
				}, 5000);
			}
			
			transaction.onerror = function(event) {
				console.log('>>>>> add error: ', event);
				csvViewer.view.setup.status_bar.setText("Couldn't import csv records !");
			};
			
			items.shift();
			
			csvViewer.view.setup.status_bar.setText('Importing csv records');
			csvViewer.view.setup.container.innerHTML = "<br>Importing csv records ... please wait<br>" 
					+ csvViewer.view.setup.container.innerHTML;
					
			putNext();		
		}catch(e)
		{
			console.log( e.stack );
			csvViewer.view.setup.status_bar.setText(e.message);
		}
	}
	
	, _formatRecordForGrid = function( record ){
		var a = [];
		for(var i in record)
		{
			if( record.hasOwnProperty(i) )
			{
				if( i != 'inventory_id' )
					a.push(record[i]);	
			}
		}
		return a;
	}
	
	, _matches = function ( strOriginal, strSearchFor ){
		strOriginal = strOriginal.toString();
		strSearchFor = strSearchFor.toString(),
		strOriginalIndex = strOriginal.indexOf( strSearchFor );
		if( strOriginalIndex == 0 )
			return true;
		else
			if( strOriginalIndex > 0 )
			{
				var stocheck = strOriginalIndex + strSearchFor.length,
				ostrlength = strOriginal.length;
				if( stocheck == ostrlength )
					return true;
			}
		return false;
	}
	
	
	, _searchExact = function( index_name, value ){
		try
		{
			if(value == "") 
			{
				dhtmlx.alert('Please provide a value to search');
				return;
			}
			console.warn('------------------- start exact search without range.');
			console.time('Search through indexedDB Cursor. Time spent: ');
			
			csvViewer.view.grid.clearAll();
			csvViewer.view.status_bar.setText('Searching, please wait ... ');
			
			csvViewer.view.form.lock();
			csvViewer.view.layout.cells('a').progressOn();
			
			var transaction = db.transaction('inventory', "readonly"),
			table = transaction.objectStore("inventory"),
			search = table.openCursor(),
			total_found = 0,
			total_iterated = 0;
			r = Math.random(); // 
			search.addEventListener('success', function (event)
			{
				console.time('searching text performance for 5 itens ...' + r);
				var cursor = event.target.result;
				if (cursor) {
					// PROD_DESCN_TXT text to be searched
					//console.log( cursor.key, cursor.value );
					
					if( typeof cursor.value[index_name] == 'undefined' )
					{
						cursor.value[index_name] = "";	
					}
					
					var search_value = value.toString();
					var column_value = cursor.value[index_name].toString();
	
					if ( _matches( column_value, search_value ) || ( column_value == search_value ) ) {
						++total_found;
					
						if( total_found == 5 )
						{
							console.info('first 5 itens returned');
							console.timeEnd('searching text performance for 5 itens ...' + r);
							console.warn('search stills running, please wait ... ');
						}
						
						csvViewer.view.grid.addRow( cursor.key, _formatRecordForGrid( cursor.value ) );
						
					}
					++total_iterated;
					cursor.continue();
				}
				else {
					if( total_found < 5 )
					{
						console.timeEnd('searching text performance for 5 itens ...' + r);
					}
					csvViewer.view.form.unlock();
					csvViewer.view.layout.cells('a').progressOff();
					console.log('search is done. Total iterated: '+total_iterated+'. Total found records: ' + total_found);
					csvViewer.view.status_bar.setText('search is done. Total iterated: '+total_iterated+'. Total found records: ' + total_found);
					console.timeEnd('Search through indexedDB Cursor. Time spent: ');
					console.warn('------------------- end search.')
				}
			});
			search.addEventListener('error', function (event) {
				csvViewer.view.form.unlock();
				csvViewer.view.layout.cells('a').progressOff();
				console.timeEnd('Search through indexedDB Cursor. Time spent: ');
				console.warn('------------------- end search.')
			});		
				
		}catch(e)
		{
			console.log( e.stack );
			//csvViewer.view.setup.status_bar.setText(e.message);
		}
	}
	
	, _searchText = function( index_name, value ){
		try
		{
			if(value == "") 
			{
				dhtmlx.alert('Please provide a value to search');
				return;
			}
			
			console.warn('------------------- start text search without range.');
			
			console.time('Search through indexedDB Cursor. Time spent: ');
			
			csvViewer.view.grid.clearAll();
			csvViewer.view.status_bar.setText('Searching, please wait ... ');
			
			//csvViewer.view.form.lock();
			csvViewer.view.layout.cells('a').progressOn();
			
			
			var transaction = db.transaction('inventory', "readonly"),
			table = transaction.objectStore("inventory"),
			search = table.openCursor(),
			total_found = 0,
			total_iterated = 0;
			r = Math.random(); // 
			search.addEventListener('success', function (event) {
				console.time('searching text performance for 5 itens ...' + r);
				var cursor = event.target.result;
				if (cursor) {
					// PROD_DESCN_TXT text to be searched
					//console.log( cursor.key, cursor.value );
					
					if( typeof cursor.value[index_name] == 'undefined' )
					{
						cursor.value[index_name] = "";	
					}
					
					var search_value = value.toLowerCase();
					var column_value = cursor.value[index_name].toLowerCase();
					
					//var search_value = value;
					//var column_value = cursor.value[index_name];
					var re = new RegExp(search_value);
					if (re.test(column_value)) {
						++total_found;
					
						if( total_found == 5 )
						{
							console.info('first 5 itens returned');
							console.timeEnd('searching text performance for 5 itens ...' + r);
							console.warn('search stills running, please wait ... ');
						}
						
						csvViewer.view.grid.addRow( cursor.key, _formatRecordForGrid( cursor.value ) );
						
					}
					++total_iterated;
					cursor.continue();
				}
				else {
					if( total_found < 5 )
					{
						console.timeEnd('searching text performance for 5 itens ...' + r);
					}
					csvViewer.view.form.unlock();
					csvViewer.view.layout.cells('a').progressOff();
					console.log('search is done. Total iterated: '+total_iterated+'. Total found records: ' + total_found);
					csvViewer.view.status_bar.setText('search is done. Total iterated: '+total_iterated+'. Total found records: ' + total_found);
					console.timeEnd('Search through indexedDB Cursor. Time spent: ');	
					console.warn('------------------- end search.')
				}
			});
			search.addEventListener('error', function (event) {
				csvViewer.view.form.unlock();
				csvViewer.view.layout.cells('a').progressOff();
				if( total_found < 5 )
				{
					console.timeEnd('searching performance for 5 itens ...');
				}
				console.timeEnd('Search through indexedDB Cursor. Time spent: ');
				console.warn('------------------- end search.')
			});		
				
		}catch(e)
		{
			console.log( e.stack );
			//csvViewer.view.setup.status_bar.setText(e.message);
		}
	}
	
	, _searchRange = function( index_name, first, last ){
		try
		{
			console.warn('------------------- start search with IDBKeyRange.');
			
			csvViewer.view.grid.clearAll();
			csvViewer.view.status_bar.setText('Searching, please wait ... ');
			
			console.time('Search through IDBKeyRange. Time spent: ');
			
			console.time('searching performance for 5 itens ...');
			
			var transaction = db.transaction('inventory', "readonly"),
			table = transaction.objectStore("inventory"),
			index = table.index(index_name),
			range,
			search,
			total_found = 0,
			total_iterated = 0;
			try
			{
				var f = first;
				var l = last;	
				var test1 = parseInt(first);
				var test2 = parseInt(last);
				
				if( test1 >test2 )
				{
					first = l;
					last = f;
				}
			}
			catch(e)
			{
				console.log(e.stack);
			}
			
			if(first == "" && last == "") 
			{
				dhtmlx.alert('Please provide a value to search');
				return;
			}
			
			if( first != "" ) 
				if( last == '' )
					last = first;
			
			if(first != "" && last != "") 
			{
				range = IDBKeyRange.bound(first, last);
			} else if(first == "") {
				range = IDBKeyRange.upperBound(last);
			} else {
				console.log( 'lowerBound(first)' );
				range = IDBKeyRange.lowerBound(first);
			}
			
			search = index.openCursor(range);
			
			search.addEventListener('success', function (event) {
				var cursor = event.target.result;
				if(cursor) {
					//console.log( cursor.key, _formatRecordForGrid( cursor.value ) );
					
					++total_found;
					
					if( total_found == 5 )
					{
						console.info('first 5 itens returned');
						console.timeEnd('searching performance for 5 itens ...');
						console.warn('search stills running, please wait ... ');
					}
					
					csvViewer.view.grid.addRow( cursor.key, _formatRecordForGrid( cursor.value ) );
					++total_iterated;
					cursor.continue();
				}
				else
				{
					if( total_found < 5 )
					{
						console.timeEnd('searching performance for 5 itens ...');
					}
					console.log('search is done. Total iterated: '+total_iterated+'. Total found records: ' + total_found);
					csvViewer.view.status_bar.setText('search is done. Total iterated: '+total_iterated+'. Total found records: ' + total_found);
					console.timeEnd('Search through IDBKeyRange. Time spent: ');	
					console.warn('------------------- end search.')
				}
			});
			search.addEventListener('error', function (event) {
				csvViewer.view.form.unlock();
				csvViewer.view.layout.cells('a').progressOff();
				if( total_found < 5 )
				{
					console.timeEnd('searching performance for 5 itens ...');
				}
				console.timeEnd('Search through IDBKeyRange. Time spent: ');
				console.warn('------------------- end search.');
			});	
	
		}catch(e)
		{
			console.log( e.stack );
			//csvViewer.view.setup.status_bar.setText(e.message);
		}
	}
	
	
	/**
	* Creates the table used to store the csv data.
	* @method
	* @param {object} c - Connection payload
	* var c = {
	*	db : event.target.result
	* 	onSuccess : function(){}
	* 	onFail : function(){}
	* 	resolve : resolve
	* 	reject : reject
	* }
	*/
	, _createTables = function( c ){
		try
		{
			var db = c.db;
			dhtmlx.message('Creating inventory table');
			
			try{
				db.deleteObjectStore("inventory");	
			}catch(e)
			{
				console.log('could not delete table');
			}
			
			var objectStore = db.createObjectStore("inventory", {
				keyPath: "inventory_id", autoIncrement:true
			});
			
			objectStore.createIndex("BARCODE_GTIN", "BARCODE_GTIN", {
				unique: false
			});
			objectStore.createIndex("PROD_CD", "PROD_CD", {
				unique: false
			});
			objectStore.createIndex("CATALOG", "CATALOG", {
				unique: false
			});
			objectStore.createIndex("PROD_DESCN_TXT", "PROD_DESCN_TXT", {
				unique: false
			});
			
			objectStore.createIndex("GS1_MANUFACTURE_NAME", "GS1_MANUFACTURE_NAME", {
				unique: false
			});
			
			
			
			objectStore.transaction.oncomplete = function (event) {
				dhtmlx.message('inventory table created');
				c.resolve('created and connected');	
				if( c.onSuccess ) c.onSuccess();
			}
			objectStore.transaction.onerror = function (event) {
				//event.srcElement.error.name
				//event.srcElement.error.message
				if( c.onFail ) c.onFail(event.srcElement.error.message);
				c.reject("Couldn't create table !");
				dhtmlx.message("Couldn't create table !");
			};
			objectStore.transaction.onabort = function (event) {
				if( c.onFail ) c.onFail(event.srcElement.error.message);
				c.reject("Couldn't create table !");
				dhtmlx.message("Couldn't create table !");
			};	
		}
		catch(e)
		{
			console.log( e.stack );
			if( c.onFail ) c.onFail(e.message);
			c.reject("Couldn't create table !");
			dhtmlx.message("Couldn't create table !");
		}
	}
	
	_getQuota = function (onSuccess, onFail) {
		try{
			var webkitStorageInfo = window.webkitStorageInfo || navigator.webkitTemporaryStorage || navigator.webkitPersistentStorage;
			webkitStorageInfo.queryUsageAndQuota(webkitStorageInfo.TEMPORARY, function (used, remaining) {
				if (onSuccess) onSuccess(used, remaining);
			}, function (e) {
				if (onFail) onFail(e);
			});	
		}
		catch(e)
		{
			var err = "This browser does not provide quota management.";
			dhtmlx.alert('Quota information', err, 'icons/db.png');
		}
	}
	
	, setDbGenericErrorHandler = function(){
		db.onerror = function(event) {
		  console.log("Database error: ");
		  console.log(event);
		};
	}
	
	, _count = function(){
		db.transaction(["inventory"],"readonly").objectStore("inventory").count().onsuccess = function(event) {
			csvViewer.view.status_bar.setText('Total records in inventory table: '+event.target.result+'.');
		};	
		
	}
	
	, API = {
		start : _start
		, request : request
		, db : db
		, addRecords : _addRecords
		, searchExact : _searchExact
		, searchText : _searchText
		, searchRange : _searchRange
		, getQuota : _getQuota
		, count : _count
	};
	
	return API;
})();