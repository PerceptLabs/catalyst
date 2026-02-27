/**
 * Crypto basics for QuickJS.
 * Provides randomBytes, randomUUID, createHash (stub), and related utilities.
 * Uses a xorshift128+ PRNG (NOT cryptographically secure) as fallback.
 * Returns source code string to be eval'd inside QuickJS.
 */
export function getCryptoSource(): string {
  return `
(function() {
  // Simple xorshift128+ PRNG (deterministic, NOT cryptographically secure)
  // Used as a fallback when no host-provided RNG is available
  var _state0 = 0x12345678;
  var _state1 = 0x9abcdef0;

  function _seed(s) {
    _state0 = s | 0;
    _state1 = (s * 0x6c078965 + 1) | 0;
    if (_state0 === 0) _state0 = 1;
    if (_state1 === 0) _state1 = 1;
  }

  // Initialize seed from Date.now()
  _seed(Date.now());

  function _nextRandom() {
    var s1 = _state0;
    var s0 = _state1;
    _state0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >> 17;
    s1 ^= s0;
    s1 ^= s0 >> 26;
    _state1 = s1;
    return ((_state0 + _state1) >>> 0) / 0x100000000;
  }

  function _randomByte() {
    return Math.floor(_nextRandom() * 256);
  }

  function _bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      if (h.length < 2) h = '0' + h;
      hex += h;
    }
    return hex;
  }

  function _bytesToBase64(bytes) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var result = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i];
      var b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      result += chars[(a >> 2) & 0x3f];
      result += chars[((a & 0x03) << 4) | ((b >> 4) & 0x0f)];
      result += i + 1 < bytes.length ? chars[((b & 0x0f) << 2) | ((c >> 6) & 0x03)] : '=';
      result += i + 2 < bytes.length ? chars[c & 0x3f] : '=';
    }
    return result;
  }

  function randomBytes(size) {
    if (typeof size !== 'number' || size < 0) {
      throw new RangeError('The value of "size" is out of range.');
    }
    size = Math.floor(size);

    // If host-provided randomBytes is available, use it
    if (typeof __hostRandomBytes === 'function') {
      return __hostRandomBytes(size);
    }

    var bytes = new Uint8Array(size);
    for (var i = 0; i < size; i++) {
      bytes[i] = _randomByte();
    }

    // Wrap in a Buffer-like object if Buffer is available
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return Buffer.from(bytes);
    }

    // Return a minimal buffer-like object
    var result = {
      _data: bytes,
      length: size,
      toString: function(encoding) {
        encoding = (encoding || 'hex').toLowerCase();
        if (encoding === 'hex') {
          return _bytesToHex(bytes);
        }
        if (encoding === 'base64') {
          return _bytesToBase64(bytes);
        }
        return String.fromCharCode.apply(null, bytes);
      }
    };
    return result;
  }

  function randomUUID() {
    // If host-provided randomUUID is available, use it
    if (typeof __hostRandomUUID === 'function') {
      return __hostRandomUUID();
    }

    var bytes = new Uint8Array(16);
    for (var i = 0; i < 16; i++) {
      bytes[i] = _randomByte();
    }

    // Set version 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // Set variant (10xx)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    var hex = _bytesToHex(bytes);

    return hex.slice(0, 8) + '-' +
           hex.slice(8, 12) + '-' +
           hex.slice(12, 16) + '-' +
           hex.slice(16, 20) + '-' +
           hex.slice(20, 32);
  }

  function randomInt(min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    min = Math.ceil(min);
    max = Math.floor(max);
    if (min >= max) {
      throw new RangeError('The value of "max" must be greater than "min".');
    }
    return Math.floor(_nextRandom() * (max - min)) + min;
  }

  function randomFillSync(buffer, offset, size) {
    offset = offset || 0;
    var data = buffer._data || buffer;
    size = size !== undefined ? size : data.length - offset;
    for (var i = 0; i < size; i++) {
      data[offset + i] = _randomByte();
    }
    return buffer;
  }

  // FNV-1a hash function (NOT cryptographically secure, for API compat only)
  function _fnv1a(data) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < data.length; i++) {
      hash ^= data[i];
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function _stringToBytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6));
        bytes.push(0x80 | (code & 0x3f));
      } else {
        bytes.push(0xe0 | (code >> 12));
        bytes.push(0x80 | ((code >> 6) & 0x3f));
        bytes.push(0x80 | (code & 0x3f));
      }
    }
    return bytes;
  }

  function _toByteArray(data) {
    if (typeof data === 'string') {
      return _stringToBytes(data);
    } else if (data && data._data) {
      return Array.prototype.slice.call(data._data);
    } else if (data instanceof Uint8Array) {
      return Array.prototype.slice.call(data);
    }
    return Array.prototype.slice.call(data);
  }

  function _simpleHash(algorithm, data) {
    var bytes = _toByteArray(data);

    // Produce repeatable hash bytes using FNV-1a in multiple passes
    var h1 = _fnv1a(bytes);
    var modified = bytes.slice();
    for (var i = 0; i < modified.length; i++) {
      modified[i] = (modified[i] + 0x9e) & 0xff;
    }
    var h2 = _fnv1a(modified);

    var targetLen;
    if (algorithm === 'md5') targetLen = 16;
    else if (algorithm === 'sha1') targetLen = 20;
    else if (algorithm === 'sha256') targetLen = 32;
    else if (algorithm === 'sha512') targetLen = 64;
    else targetLen = 32;

    var state = [h1, h2, h1 ^ h2, (h1 + h2) >>> 0];
    var hashBytes = [];
    for (var i = 0; i < targetLen; i++) {
      var idx = i % 4;
      state[idx] = Math.imul(state[idx] ^ (i + 1), 0x01000193) >>> 0;
      hashBytes.push(state[idx] & 0xff);
    }

    return hashBytes;
  }

  function Hash(algorithm) {
    if (!(this instanceof Hash)) {
      return new Hash(algorithm);
    }
    this._algorithm = algorithm.toLowerCase();
    this._data = [];
    this._finalized = false;
  }

  Hash.prototype.update = function(data, inputEncoding) {
    if (this._finalized) {
      throw new Error('Digest already called');
    }
    var bytes = _toByteArray(data);
    for (var i = 0; i < bytes.length; i++) {
      this._data.push(bytes[i]);
    }
    return this;
  };

  Hash.prototype.digest = function(encoding) {
    if (this._finalized) {
      throw new Error('Digest already called');
    }
    this._finalized = true;

    var hashBytes = _simpleHash(this._algorithm, this._data);

    encoding = (encoding || 'hex').toLowerCase();
    if (encoding === 'hex') {
      return _bytesToHex(hashBytes);
    } else if (encoding === 'base64') {
      return _bytesToBase64(hashBytes);
    } else {
      // Return as buffer-like object
      return { _data: new Uint8Array(hashBytes), length: hashBytes.length };
    }
  };

  Hash.prototype.copy = function() {
    var h = new Hash(this._algorithm);
    h._data = this._data.slice();
    return h;
  };

  function Hmac(algorithm, key) {
    if (!(this instanceof Hmac)) {
      return new Hmac(algorithm, key);
    }
    this._algorithm = algorithm.toLowerCase();
    this._key = _toByteArray(key);
    this._data = [];
    this._finalized = false;
  }

  Hmac.prototype.update = function(data, inputEncoding) {
    if (this._finalized) {
      throw new Error('Digest already called');
    }
    var bytes = _toByteArray(data);
    for (var i = 0; i < bytes.length; i++) {
      this._data.push(bytes[i]);
    }
    return this;
  };

  Hmac.prototype.digest = function(encoding) {
    if (this._finalized) {
      throw new Error('Digest already called');
    }
    this._finalized = true;

    // Simple HMAC approximation: hash(key + data)
    var combined = this._key.concat(this._data);
    var hashBytes = _simpleHash(this._algorithm, combined);

    encoding = (encoding || 'hex').toLowerCase();
    if (encoding === 'hex') {
      return _bytesToHex(hashBytes);
    } else if (encoding === 'base64') {
      return _bytesToBase64(hashBytes);
    } else {
      return { _data: new Uint8Array(hashBytes), length: hashBytes.length };
    }
  };

  function createHash(algorithm) {
    return new Hash(algorithm);
  }

  function createHmac(algorithm, key) {
    return new Hmac(algorithm, key);
  }

  function getHashes() {
    return ['md5', 'sha1', 'sha256', 'sha512'];
  }

  function getCiphers() {
    return [];
  }

  function timingSafeEqual(a, b) {
    var aData = a._data || a;
    var bData = b._data || b;
    if (aData.length !== bData.length) {
      throw new RangeError('Input buffers must have the same byte length');
    }
    var result = 0;
    for (var i = 0; i < aData.length; i++) {
      result |= aData[i] ^ bData[i];
    }
    return result === 0;
  }

  var crypto = {
    randomBytes: randomBytes,
    randomUUID: randomUUID,
    randomInt: randomInt,
    randomFillSync: randomFillSync,
    createHash: createHash,
    createHmac: createHmac,
    getHashes: getHashes,
    getCiphers: getCiphers,
    timingSafeEqual: timingSafeEqual,
    Hash: Hash,
    Hmac: Hmac
  };

  module.exports = crypto;
})();
`;
}
