var querystring = require("querystring");
var https = require('https');
var _ = require('underscore');
var crypto = require('crypto');
var ProxyAgent = require('proxy-agent');
 
_.mixin({
  // compact for objects
  compactObject: function(to_clean) {
    _.map(to_clean, function(value, key, to_clean) {
      if (value === undefined)
        delete to_clean[key];
    });
    return to_clean;
  }
});

var Bitstamp = function(key, secret, client_id, nonce_generator, options) {
  this.key = key;
  this.secret = secret;
  this.client_id = client_id;
  this.nonce_generator = (nonce_generator || function() {
    var now = new Date();
    return now.getTime();
  });
  this.pair = (options||{}).pair || 'btcusd';

  this.url = (options&&options.apiUrl)||"www.bitstamp.net";
  var proxyUrl = (options&&options.proxyUrl);
  if(proxyUrl) {
    this.agent = new ProxyAgent(proxyUrl)
  }

  _.bindAll(this);
};

Bitstamp.prototype._request = function(method, path, data, callback, args) {
  
  var options = {
    host: this.url,
    path: path,
    method: method,
    headers: {
      'User-Agent': 'Mozilla/4.0 (compatible; Bitstamp node.js client)'
    },
    agent: this.agent
  };

  if(method === 'post') {
    options.headers['Content-Length'] = data.length;
    options.headers['content-type'] = 'application/x-www-form-urlencoded';
  }

  var self = this;

  var req = https.request(options, function(res) {
    res.setEncoding('utf8');
    var buffer = '';
    res.on('data', function(data) {
      buffer += data;
    });
    res.on('end', function() {
      if (res.statusCode !== 200) {
        return callback(new Error('Bitstamp error ' + res.statusCode + ': ' + buffer));
      }
      var json;
      try {
        json = JSON.parse(buffer);
      } catch (err) {
        return callback(err);
      }
      if(json&&json.error) {
        return callback(json);
      }
      callback(null, json);
    });
  });

  req.on('error', function(err) {
    callback(err);
  });

  req.on('socket', function (socket) {
    socket.setTimeout(5000);
    socket.on('timeout', function() {
      req.abort();
    });
  });
  
  req.end(data);

};

// if you call new Date to fast it will generate
// the same ms, helper to make sure the nonce is
// truly unique (supports up to 999 calls per ms).
Bitstamp.prototype._generateNonce = function() {
  var now = new Date().getTime();

  if(now !== this.last)
    this.nonceIncr = -1;    

  this.last = now;
  this.nonceIncr++;

  // add padding to nonce incr
  // @link https://stackoverflow.com/questions/6823592/numbers-in-the-form-of-001
  var padding = 
    this.nonceIncr < 10 ? '000' : 
      this.nonceIncr < 100 ? '00' :
        this.nonceIncr < 1000 ?  '0' : '';
  return now + padding + this.nonceIncr;
}

Bitstamp.prototype._get = function(action, callback, args) {
  args = _.compactObject(args);
  var path = '/api/' + action;
  if(args && args.pair)
    path += "/" + args.pair;
  path += (querystring.stringify(args) === '' ? '/' : '/?') + querystring.stringify(args);
  this._request('get', path, undefined, callback, args);
};

Bitstamp.prototype._post = function(action, callback, args) {
  if(!this.key || !this.secret || !this.client_id)
    return callback(new Error('Must provide key, secret and client ID to make this API request.'));

  var path = '/api/' + action + '/';
  if(args && args.pair)
    path += args.pair + "/"

  var now = new Date();
  var nonce = this.nonce_generator();
  var message = nonce + this.client_id + this.key;
  var signer = crypto.createHmac('sha256', new Buffer(this.secret, 'utf8'));
  var signature = signer.update(message).digest('hex').toUpperCase();

  args = _.extend({
    key: this.key,
    signature: signature,
    nonce: nonce
  }, args);

  args = _.compactObject(args);
  var data = querystring.stringify(args);

  this._request('post', path, data, callback, args);
}

// 
// Public API
// 

Bitstamp.prototype.transactions = function(options, callback) {
  if(!callback) {
    callback = options;
    options = {};
  }
  options.pair = this.pair;
  this._get('v2/transactions', callback, options);
}

Bitstamp.prototype.ticker = function(callback) {
  this._get('v2/ticker', callback, {pair: this.pair});
}

Bitstamp.prototype.order_book = function(group, callback) {
  if(!callback) {
    callback = group;
    group = undefined;
  }
  var options;
  if(typeof limit === 'object')
    options = group;
  else
    options = {group: group};
  options.pair = this.pair;
  this._get('v2/order_book', callback, options);
}

Bitstamp.prototype.eur_usd = function(callback) {
  this._get('eur_usd', callback);
}

// 
// Private API
// (you need to have key / secret / client ID set)
// 

Bitstamp.prototype.balance = function(callback) {
  this._post('balance', callback);
}

Bitstamp.prototype.order_status = function(id, callback) {
  this._post('order_status', callback, {id: id});
}

Bitstamp.prototype.user_transactions = function(params, callback) {
  if(!callback) {
    callback = params;
    params = {};
  }
  params.pair = this.pair;
  this._post('user_transactions', callback, params);
}

Bitstamp.prototype.open_orders = function(callback) {
  this._post('v2/open_orders', callback);
}

Bitstamp.prototype.cancel_order = function(id, callback) {
  this._post('cancel_order', callback, {id: id});
}

Bitstamp.prototype.buy = function(amount, price, callback) {
  this._post('v2/buy', callback, {amount: amount, price: price, pair: this.pair});
}

Bitstamp.prototype.sell = function(amount, price, callback) {
  this._post('v2/sell', callback, {amount: amount, price: price, pair: this.pair});
}

Bitstamp.prototype.withdrawal_requests = function(callback) {
  this._post('withdrawal_requests', callback);
}

Bitstamp.prototype.bitcoin_withdrawal = function(amount, address, callback) {
  this._post('bitcoin_withdrawal', callback, {amount: amount, address: address});
}

Bitstamp.prototype.bitcoin_deposit_address = function(callback) {
  this._post('bitcoin_deposit_address', callback);
}

Bitstamp.prototype.unconfirmed_btc = function(callback) {
  this._post('unconfirmed_btc', callback);
}

Bitstamp.prototype.ripple_withdrawal = function(amount, address, currency, callback) {
  this._post('ripple_withdrawal', callback, {amount: amount, address: address, currency: currency});
}

Bitstamp.prototype.ripple_address = function(callback) {
  this._post('ripple_address', callback);
}

module.exports = Bitstamp;
