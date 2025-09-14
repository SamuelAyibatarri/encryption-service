(function () {
  'use strict';

  var global$1 = (typeof global !== "undefined" ? global :
    typeof self !== "undefined" ? self :
    typeof window !== "undefined" ? window : {});

  var lookup = [];
  var revLookup = [];
  var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
  var inited = false;
  function init () {
    inited = true;
    var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }

    revLookup['-'.charCodeAt(0)] = 62;
    revLookup['_'.charCodeAt(0)] = 63;
  }

  function toByteArray (b64) {
    if (!inited) {
      init();
    }
    var i, j, l, tmp, placeHolders, arr;
    var len = b64.length;

    if (len % 4 > 0) {
      throw new Error('Invalid string. Length must be a multiple of 4')
    }

    // the number of equal signs (place holders)
    // if there are two placeholders, than the two characters before it
    // represent one byte
    // if there is only one, then the three characters before it represent 2 bytes
    // this is just a cheap hack to not do indexOf twice
    placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

    // base64 is 4/3 + up to two characters of the original data
    arr = new Arr(len * 3 / 4 - placeHolders);

    // if there are placeholders, only get up to the last complete 4 chars
    l = placeHolders > 0 ? len - 4 : len;

    var L = 0;

    for (i = 0, j = 0; i < l; i += 4, j += 3) {
      tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
      arr[L++] = (tmp >> 16) & 0xFF;
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }

    if (placeHolders === 2) {
      tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
      arr[L++] = tmp & 0xFF;
    } else if (placeHolders === 1) {
      tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }

    return arr
  }

  function tripletToBase64 (num) {
    return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
  }

  function encodeChunk (uint8, start, end) {
    var tmp;
    var output = [];
    for (var i = start; i < end; i += 3) {
      tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
      output.push(tripletToBase64(tmp));
    }
    return output.join('')
  }

  function fromByteArray (uint8) {
    if (!inited) {
      init();
    }
    var tmp;
    var len = uint8.length;
    var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
    var output = '';
    var parts = [];
    var maxChunkLength = 16383; // must be multiple of 3

    // go through the array every three bytes, we'll deal with trailing stuff later
    for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
      parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
    }

    // pad the end with zeros, but make sure to not forget the extra bytes
    if (extraBytes === 1) {
      tmp = uint8[len - 1];
      output += lookup[tmp >> 2];
      output += lookup[(tmp << 4) & 0x3F];
      output += '==';
    } else if (extraBytes === 2) {
      tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
      output += lookup[tmp >> 10];
      output += lookup[(tmp >> 4) & 0x3F];
      output += lookup[(tmp << 2) & 0x3F];
      output += '=';
    }

    parts.push(output);

    return parts.join('')
  }

  function read (buffer, offset, isLE, mLen, nBytes) {
    var e, m;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var nBits = -7;
    var i = isLE ? (nBytes - 1) : 0;
    var d = isLE ? -1 : 1;
    var s = buffer[offset + i];

    i += d;

    e = s & ((1 << (-nBits)) - 1);
    s >>= (-nBits);
    nBits += eLen;
    for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    m = e & ((1 << (-nBits)) - 1);
    e >>= (-nBits);
    nBits += mLen;
    for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    if (e === 0) {
      e = 1 - eBias;
    } else if (e === eMax) {
      return m ? NaN : ((s ? -1 : 1) * Infinity)
    } else {
      m = m + Math.pow(2, mLen);
      e = e - eBias;
    }
    return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
  }

  function write (buffer, value, offset, isLE, mLen, nBytes) {
    var e, m, c;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
    var i = isLE ? 0 : (nBytes - 1);
    var d = isLE ? 1 : -1;
    var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

    value = Math.abs(value);

    if (isNaN(value) || value === Infinity) {
      m = isNaN(value) ? 1 : 0;
      e = eMax;
    } else {
      e = Math.floor(Math.log(value) / Math.LN2);
      if (value * (c = Math.pow(2, -e)) < 1) {
        e--;
        c *= 2;
      }
      if (e + eBias >= 1) {
        value += rt / c;
      } else {
        value += rt * Math.pow(2, 1 - eBias);
      }
      if (value * c >= 2) {
        e++;
        c /= 2;
      }

      if (e + eBias >= eMax) {
        m = 0;
        e = eMax;
      } else if (e + eBias >= 1) {
        m = (value * c - 1) * Math.pow(2, mLen);
        e = e + eBias;
      } else {
        m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
        e = 0;
      }
    }

    for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

    e = (e << mLen) | m;
    eLen += mLen;
    for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

    buffer[offset + i - d] |= s * 128;
  }

  var toString = {}.toString;

  var isArray = Array.isArray || function (arr) {
    return toString.call(arr) == '[object Array]';
  };

  /*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
   * @license  MIT
   */

  var INSPECT_MAX_BYTES = 50;

  /**
   * If `Buffer.TYPED_ARRAY_SUPPORT`:
   *   === true    Use Uint8Array implementation (fastest)
   *   === false   Use Object implementation (most compatible, even IE6)
   *
   * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
   * Opera 11.6+, iOS 4.2+.
   *
   * Due to various browser bugs, sometimes the Object implementation will be used even
   * when the browser supports typed arrays.
   *
   * Note:
   *
   *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
   *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
   *
   *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
   *
   *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
   *     incorrect length in some situations.

   * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
   * get the Object implementation, which is slower but behaves correctly.
   */
  Buffer.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== undefined
    ? global$1.TYPED_ARRAY_SUPPORT
    : true;

  /*
   * Export kMaxLength after typed array support is determined.
   */
  kMaxLength();

  function kMaxLength () {
    return Buffer.TYPED_ARRAY_SUPPORT
      ? 0x7fffffff
      : 0x3fffffff
  }

  function createBuffer (that, length) {
    if (kMaxLength() < length) {
      throw new RangeError('Invalid typed array length')
    }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = new Uint8Array(length);
      that.__proto__ = Buffer.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      if (that === null) {
        that = new Buffer(length);
      }
      that.length = length;
    }

    return that
  }

  /**
   * The Buffer constructor returns instances of `Uint8Array` that have their
   * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
   * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
   * and the `Uint8Array` methods. Square bracket notation works as expected -- it
   * returns a single octet.
   *
   * The `Uint8Array` prototype remains unmodified.
   */

  function Buffer (arg, encodingOrOffset, length) {
    if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
      return new Buffer(arg, encodingOrOffset, length)
    }

    // Common case.
    if (typeof arg === 'number') {
      if (typeof encodingOrOffset === 'string') {
        throw new Error(
          'If encoding is specified then the first argument must be a string'
        )
      }
      return allocUnsafe(this, arg)
    }
    return from(this, arg, encodingOrOffset, length)
  }

  Buffer.poolSize = 8192; // not used by this implementation

  // TODO: Legacy, not needed anymore. Remove in next major version.
  Buffer._augment = function (arr) {
    arr.__proto__ = Buffer.prototype;
    return arr
  };

  function from (that, value, encodingOrOffset, length) {
    if (typeof value === 'number') {
      throw new TypeError('"value" argument must not be a number')
    }

    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return fromArrayBuffer(that, value, encodingOrOffset, length)
    }

    if (typeof value === 'string') {
      return fromString(that, value, encodingOrOffset)
    }

    return fromObject(that, value)
  }

  /**
   * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
   * if value is a number.
   * Buffer.from(str[, encoding])
   * Buffer.from(array)
   * Buffer.from(buffer)
   * Buffer.from(arrayBuffer[, byteOffset[, length]])
   **/
  Buffer.from = function (value, encodingOrOffset, length) {
    return from(null, value, encodingOrOffset, length)
  };

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    Buffer.prototype.__proto__ = Uint8Array.prototype;
    Buffer.__proto__ = Uint8Array;
  }

  function assertSize (size) {
    if (typeof size !== 'number') {
      throw new TypeError('"size" argument must be a number')
    } else if (size < 0) {
      throw new RangeError('"size" argument must not be negative')
    }
  }

  function alloc (that, size, fill, encoding) {
    assertSize(size);
    if (size <= 0) {
      return createBuffer(that, size)
    }
    if (fill !== undefined) {
      // Only pay attention to encoding if it's a string. This
      // prevents accidentally sending in a number that would
      // be interpretted as a start offset.
      return typeof encoding === 'string'
        ? createBuffer(that, size).fill(fill, encoding)
        : createBuffer(that, size).fill(fill)
    }
    return createBuffer(that, size)
  }

  /**
   * Creates a new filled Buffer instance.
   * alloc(size[, fill[, encoding]])
   **/
  Buffer.alloc = function (size, fill, encoding) {
    return alloc(null, size, fill, encoding)
  };

  function allocUnsafe (that, size) {
    assertSize(size);
    that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
    if (!Buffer.TYPED_ARRAY_SUPPORT) {
      for (var i = 0; i < size; ++i) {
        that[i] = 0;
      }
    }
    return that
  }

  /**
   * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
   * */
  Buffer.allocUnsafe = function (size) {
    return allocUnsafe(null, size)
  };
  /**
   * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
   */
  Buffer.allocUnsafeSlow = function (size) {
    return allocUnsafe(null, size)
  };

  function fromString (that, string, encoding) {
    if (typeof encoding !== 'string' || encoding === '') {
      encoding = 'utf8';
    }

    if (!Buffer.isEncoding(encoding)) {
      throw new TypeError('"encoding" must be a valid string encoding')
    }

    var length = byteLength(string, encoding) | 0;
    that = createBuffer(that, length);

    var actual = that.write(string, encoding);

    if (actual !== length) {
      // Writing a hex string, for example, that contains invalid characters will
      // cause everything after the first invalid character to be ignored. (e.g.
      // 'abxxcd' will be treated as 'ab')
      that = that.slice(0, actual);
    }

    return that
  }

  function fromArrayLike (that, array) {
    var length = array.length < 0 ? 0 : checked(array.length) | 0;
    that = createBuffer(that, length);
    for (var i = 0; i < length; i += 1) {
      that[i] = array[i] & 255;
    }
    return that
  }

  function fromArrayBuffer (that, array, byteOffset, length) {
    array.byteLength; // this throws if `array` is not a valid ArrayBuffer

    if (byteOffset < 0 || array.byteLength < byteOffset) {
      throw new RangeError('\'offset\' is out of bounds')
    }

    if (array.byteLength < byteOffset + (length || 0)) {
      throw new RangeError('\'length\' is out of bounds')
    }

    if (byteOffset === undefined && length === undefined) {
      array = new Uint8Array(array);
    } else if (length === undefined) {
      array = new Uint8Array(array, byteOffset);
    } else {
      array = new Uint8Array(array, byteOffset, length);
    }

    if (Buffer.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = array;
      that.__proto__ = Buffer.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      that = fromArrayLike(that, array);
    }
    return that
  }

  function fromObject (that, obj) {
    if (internalIsBuffer(obj)) {
      var len = checked(obj.length) | 0;
      that = createBuffer(that, len);

      if (that.length === 0) {
        return that
      }

      obj.copy(that, 0, 0, len);
      return that
    }

    if (obj) {
      if ((typeof ArrayBuffer !== 'undefined' &&
          obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
        if (typeof obj.length !== 'number' || isnan(obj.length)) {
          return createBuffer(that, 0)
        }
        return fromArrayLike(that, obj)
      }

      if (obj.type === 'Buffer' && isArray(obj.data)) {
        return fromArrayLike(that, obj.data)
      }
    }

    throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
  }

  function checked (length) {
    // Note: cannot use `length < kMaxLength()` here because that fails when
    // length is NaN (which is otherwise coerced to zero.)
    if (length >= kMaxLength()) {
      throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                           'size: 0x' + kMaxLength().toString(16) + ' bytes')
    }
    return length | 0
  }
  Buffer.isBuffer = isBuffer;
  function internalIsBuffer (b) {
    return !!(b != null && b._isBuffer)
  }

  Buffer.compare = function compare (a, b) {
    if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
      throw new TypeError('Arguments must be Buffers')
    }

    if (a === b) return 0

    var x = a.length;
    var y = b.length;

    for (var i = 0, len = Math.min(x, y); i < len; ++i) {
      if (a[i] !== b[i]) {
        x = a[i];
        y = b[i];
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  };

  Buffer.isEncoding = function isEncoding (encoding) {
    switch (String(encoding).toLowerCase()) {
      case 'hex':
      case 'utf8':
      case 'utf-8':
      case 'ascii':
      case 'latin1':
      case 'binary':
      case 'base64':
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return true
      default:
        return false
    }
  };

  Buffer.concat = function concat (list, length) {
    if (!isArray(list)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }

    if (list.length === 0) {
      return Buffer.alloc(0)
    }

    var i;
    if (length === undefined) {
      length = 0;
      for (i = 0; i < list.length; ++i) {
        length += list[i].length;
      }
    }

    var buffer = Buffer.allocUnsafe(length);
    var pos = 0;
    for (i = 0; i < list.length; ++i) {
      var buf = list[i];
      if (!internalIsBuffer(buf)) {
        throw new TypeError('"list" argument must be an Array of Buffers')
      }
      buf.copy(buffer, pos);
      pos += buf.length;
    }
    return buffer
  };

  function byteLength (string, encoding) {
    if (internalIsBuffer(string)) {
      return string.length
    }
    if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
        (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
      return string.byteLength
    }
    if (typeof string !== 'string') {
      string = '' + string;
    }

    var len = string.length;
    if (len === 0) return 0

    // Use a for loop to avoid recursion
    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'ascii':
        case 'latin1':
        case 'binary':
          return len
        case 'utf8':
        case 'utf-8':
        case undefined:
          return utf8ToBytes(string).length
        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return len * 2
        case 'hex':
          return len >>> 1
        case 'base64':
          return base64ToBytes(string).length
        default:
          if (loweredCase) return utf8ToBytes(string).length // assume utf8
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  }
  Buffer.byteLength = byteLength;

  function slowToString (encoding, start, end) {
    var loweredCase = false;

    // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
    // property of a typed array.

    // This behaves neither like String nor Uint8Array in that we set start/end
    // to their upper/lower bounds if the value passed is out of range.
    // undefined is handled specially as per ECMA-262 6th Edition,
    // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
    if (start === undefined || start < 0) {
      start = 0;
    }
    // Return early if start > this.length. Done here to prevent potential uint32
    // coercion fail below.
    if (start > this.length) {
      return ''
    }

    if (end === undefined || end > this.length) {
      end = this.length;
    }

    if (end <= 0) {
      return ''
    }

    // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
    end >>>= 0;
    start >>>= 0;

    if (end <= start) {
      return ''
    }

    if (!encoding) encoding = 'utf8';

    while (true) {
      switch (encoding) {
        case 'hex':
          return hexSlice(this, start, end)

        case 'utf8':
        case 'utf-8':
          return utf8Slice(this, start, end)

        case 'ascii':
          return asciiSlice(this, start, end)

        case 'latin1':
        case 'binary':
          return latin1Slice(this, start, end)

        case 'base64':
          return base64Slice(this, start, end)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return utf16leSlice(this, start, end)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = (encoding + '').toLowerCase();
          loweredCase = true;
      }
    }
  }

  // The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
  // Buffer instances.
  Buffer.prototype._isBuffer = true;

  function swap (b, n, m) {
    var i = b[n];
    b[n] = b[m];
    b[m] = i;
  }

  Buffer.prototype.swap16 = function swap16 () {
    var len = this.length;
    if (len % 2 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 16-bits')
    }
    for (var i = 0; i < len; i += 2) {
      swap(this, i, i + 1);
    }
    return this
  };

  Buffer.prototype.swap32 = function swap32 () {
    var len = this.length;
    if (len % 4 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 32-bits')
    }
    for (var i = 0; i < len; i += 4) {
      swap(this, i, i + 3);
      swap(this, i + 1, i + 2);
    }
    return this
  };

  Buffer.prototype.swap64 = function swap64 () {
    var len = this.length;
    if (len % 8 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 64-bits')
    }
    for (var i = 0; i < len; i += 8) {
      swap(this, i, i + 7);
      swap(this, i + 1, i + 6);
      swap(this, i + 2, i + 5);
      swap(this, i + 3, i + 4);
    }
    return this
  };

  Buffer.prototype.toString = function toString () {
    var length = this.length | 0;
    if (length === 0) return ''
    if (arguments.length === 0) return utf8Slice(this, 0, length)
    return slowToString.apply(this, arguments)
  };

  Buffer.prototype.equals = function equals (b) {
    if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
    if (this === b) return true
    return Buffer.compare(this, b) === 0
  };

  Buffer.prototype.inspect = function inspect () {
    var str = '';
    var max = INSPECT_MAX_BYTES;
    if (this.length > 0) {
      str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
      if (this.length > max) str += ' ... ';
    }
    return '<Buffer ' + str + '>'
  };

  Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
    if (!internalIsBuffer(target)) {
      throw new TypeError('Argument must be a Buffer')
    }

    if (start === undefined) {
      start = 0;
    }
    if (end === undefined) {
      end = target ? target.length : 0;
    }
    if (thisStart === undefined) {
      thisStart = 0;
    }
    if (thisEnd === undefined) {
      thisEnd = this.length;
    }

    if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
      throw new RangeError('out of range index')
    }

    if (thisStart >= thisEnd && start >= end) {
      return 0
    }
    if (thisStart >= thisEnd) {
      return -1
    }
    if (start >= end) {
      return 1
    }

    start >>>= 0;
    end >>>= 0;
    thisStart >>>= 0;
    thisEnd >>>= 0;

    if (this === target) return 0

    var x = thisEnd - thisStart;
    var y = end - start;
    var len = Math.min(x, y);

    var thisCopy = this.slice(thisStart, thisEnd);
    var targetCopy = target.slice(start, end);

    for (var i = 0; i < len; ++i) {
      if (thisCopy[i] !== targetCopy[i]) {
        x = thisCopy[i];
        y = targetCopy[i];
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  };

  // Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
  // OR the last index of `val` in `buffer` at offset <= `byteOffset`.
  //
  // Arguments:
  // - buffer - a Buffer to search
  // - val - a string, Buffer, or number
  // - byteOffset - an index into `buffer`; will be clamped to an int32
  // - encoding - an optional encoding, relevant is val is a string
  // - dir - true for indexOf, false for lastIndexOf
  function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
    // Empty buffer means no match
    if (buffer.length === 0) return -1

    // Normalize byteOffset
    if (typeof byteOffset === 'string') {
      encoding = byteOffset;
      byteOffset = 0;
    } else if (byteOffset > 0x7fffffff) {
      byteOffset = 0x7fffffff;
    } else if (byteOffset < -2147483648) {
      byteOffset = -2147483648;
    }
    byteOffset = +byteOffset;  // Coerce to Number.
    if (isNaN(byteOffset)) {
      // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
      byteOffset = dir ? 0 : (buffer.length - 1);
    }

    // Normalize byteOffset: negative offsets start from the end of the buffer
    if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
    if (byteOffset >= buffer.length) {
      if (dir) return -1
      else byteOffset = buffer.length - 1;
    } else if (byteOffset < 0) {
      if (dir) byteOffset = 0;
      else return -1
    }

    // Normalize val
    if (typeof val === 'string') {
      val = Buffer.from(val, encoding);
    }

    // Finally, search either indexOf (if dir is true) or lastIndexOf
    if (internalIsBuffer(val)) {
      // Special case: looking for empty string/buffer always fails
      if (val.length === 0) {
        return -1
      }
      return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
    } else if (typeof val === 'number') {
      val = val & 0xFF; // Search for a byte value [0-255]
      if (Buffer.TYPED_ARRAY_SUPPORT &&
          typeof Uint8Array.prototype.indexOf === 'function') {
        if (dir) {
          return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
        } else {
          return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
        }
      }
      return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
    }

    throw new TypeError('val must be string, number or Buffer')
  }

  function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
    var indexSize = 1;
    var arrLength = arr.length;
    var valLength = val.length;

    if (encoding !== undefined) {
      encoding = String(encoding).toLowerCase();
      if (encoding === 'ucs2' || encoding === 'ucs-2' ||
          encoding === 'utf16le' || encoding === 'utf-16le') {
        if (arr.length < 2 || val.length < 2) {
          return -1
        }
        indexSize = 2;
        arrLength /= 2;
        valLength /= 2;
        byteOffset /= 2;
      }
    }

    function read (buf, i) {
      if (indexSize === 1) {
        return buf[i]
      } else {
        return buf.readUInt16BE(i * indexSize)
      }
    }

    var i;
    if (dir) {
      var foundIndex = -1;
      for (i = byteOffset; i < arrLength; i++) {
        if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
          if (foundIndex === -1) foundIndex = i;
          if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
        } else {
          if (foundIndex !== -1) i -= i - foundIndex;
          foundIndex = -1;
        }
      }
    } else {
      if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
      for (i = byteOffset; i >= 0; i--) {
        var found = true;
        for (var j = 0; j < valLength; j++) {
          if (read(arr, i + j) !== read(val, j)) {
            found = false;
            break
          }
        }
        if (found) return i
      }
    }

    return -1
  }

  Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
    return this.indexOf(val, byteOffset, encoding) !== -1
  };

  Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
  };

  Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
  };

  function hexWrite (buf, string, offset, length) {
    offset = Number(offset) || 0;
    var remaining = buf.length - offset;
    if (!length) {
      length = remaining;
    } else {
      length = Number(length);
      if (length > remaining) {
        length = remaining;
      }
    }

    // must be an even number of digits
    var strLen = string.length;
    if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

    if (length > strLen / 2) {
      length = strLen / 2;
    }
    for (var i = 0; i < length; ++i) {
      var parsed = parseInt(string.substr(i * 2, 2), 16);
      if (isNaN(parsed)) return i
      buf[offset + i] = parsed;
    }
    return i
  }

  function utf8Write (buf, string, offset, length) {
    return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
  }

  function asciiWrite (buf, string, offset, length) {
    return blitBuffer(asciiToBytes(string), buf, offset, length)
  }

  function latin1Write (buf, string, offset, length) {
    return asciiWrite(buf, string, offset, length)
  }

  function base64Write (buf, string, offset, length) {
    return blitBuffer(base64ToBytes(string), buf, offset, length)
  }

  function ucs2Write (buf, string, offset, length) {
    return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
  }

  Buffer.prototype.write = function write (string, offset, length, encoding) {
    // Buffer#write(string)
    if (offset === undefined) {
      encoding = 'utf8';
      length = this.length;
      offset = 0;
    // Buffer#write(string, encoding)
    } else if (length === undefined && typeof offset === 'string') {
      encoding = offset;
      length = this.length;
      offset = 0;
    // Buffer#write(string, offset[, length][, encoding])
    } else if (isFinite(offset)) {
      offset = offset | 0;
      if (isFinite(length)) {
        length = length | 0;
        if (encoding === undefined) encoding = 'utf8';
      } else {
        encoding = length;
        length = undefined;
      }
    // legacy write(string, encoding, offset, length) - remove in v0.13
    } else {
      throw new Error(
        'Buffer.write(string, encoding, offset[, length]) is no longer supported'
      )
    }

    var remaining = this.length - offset;
    if (length === undefined || length > remaining) length = remaining;

    if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
      throw new RangeError('Attempt to write outside buffer bounds')
    }

    if (!encoding) encoding = 'utf8';

    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'hex':
          return hexWrite(this, string, offset, length)

        case 'utf8':
        case 'utf-8':
          return utf8Write(this, string, offset, length)

        case 'ascii':
          return asciiWrite(this, string, offset, length)

        case 'latin1':
        case 'binary':
          return latin1Write(this, string, offset, length)

        case 'base64':
          // Warning: maxLength not taken into account in base64Write
          return base64Write(this, string, offset, length)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return ucs2Write(this, string, offset, length)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  };

  Buffer.prototype.toJSON = function toJSON () {
    return {
      type: 'Buffer',
      data: Array.prototype.slice.call(this._arr || this, 0)
    }
  };

  function base64Slice (buf, start, end) {
    if (start === 0 && end === buf.length) {
      return fromByteArray(buf)
    } else {
      return fromByteArray(buf.slice(start, end))
    }
  }

  function utf8Slice (buf, start, end) {
    end = Math.min(buf.length, end);
    var res = [];

    var i = start;
    while (i < end) {
      var firstByte = buf[i];
      var codePoint = null;
      var bytesPerSequence = (firstByte > 0xEF) ? 4
        : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
        : 1;

      if (i + bytesPerSequence <= end) {
        var secondByte, thirdByte, fourthByte, tempCodePoint;

        switch (bytesPerSequence) {
          case 1:
            if (firstByte < 0x80) {
              codePoint = firstByte;
            }
            break
          case 2:
            secondByte = buf[i + 1];
            if ((secondByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
              if (tempCodePoint > 0x7F) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 3:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
              if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 4:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            fourthByte = buf[i + 3];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
              if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
                codePoint = tempCodePoint;
              }
            }
        }
      }

      if (codePoint === null) {
        // we did not generate a valid codePoint so insert a
        // replacement char (U+FFFD) and advance only 1 byte
        codePoint = 0xFFFD;
        bytesPerSequence = 1;
      } else if (codePoint > 0xFFFF) {
        // encode to utf16 (surrogate pair dance)
        codePoint -= 0x10000;
        res.push(codePoint >>> 10 & 0x3FF | 0xD800);
        codePoint = 0xDC00 | codePoint & 0x3FF;
      }

      res.push(codePoint);
      i += bytesPerSequence;
    }

    return decodeCodePointsArray(res)
  }

  // Based on http://stackoverflow.com/a/22747272/680742, the browser with
  // the lowest limit is Chrome, with 0x10000 args.
  // We go 1 magnitude less, for safety
  var MAX_ARGUMENTS_LENGTH = 0x1000;

  function decodeCodePointsArray (codePoints) {
    var len = codePoints.length;
    if (len <= MAX_ARGUMENTS_LENGTH) {
      return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
    }

    // Decode in chunks to avoid "call stack size exceeded".
    var res = '';
    var i = 0;
    while (i < len) {
      res += String.fromCharCode.apply(
        String,
        codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
      );
    }
    return res
  }

  function asciiSlice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i] & 0x7F);
    }
    return ret
  }

  function latin1Slice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i]);
    }
    return ret
  }

  function hexSlice (buf, start, end) {
    var len = buf.length;

    if (!start || start < 0) start = 0;
    if (!end || end < 0 || end > len) end = len;

    var out = '';
    for (var i = start; i < end; ++i) {
      out += toHex(buf[i]);
    }
    return out
  }

  function utf16leSlice (buf, start, end) {
    var bytes = buf.slice(start, end);
    var res = '';
    for (var i = 0; i < bytes.length; i += 2) {
      res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
    }
    return res
  }

  Buffer.prototype.slice = function slice (start, end) {
    var len = this.length;
    start = ~~start;
    end = end === undefined ? len : ~~end;

    if (start < 0) {
      start += len;
      if (start < 0) start = 0;
    } else if (start > len) {
      start = len;
    }

    if (end < 0) {
      end += len;
      if (end < 0) end = 0;
    } else if (end > len) {
      end = len;
    }

    if (end < start) end = start;

    var newBuf;
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      newBuf = this.subarray(start, end);
      newBuf.__proto__ = Buffer.prototype;
    } else {
      var sliceLen = end - start;
      newBuf = new Buffer(sliceLen, undefined);
      for (var i = 0; i < sliceLen; ++i) {
        newBuf[i] = this[i + start];
      }
    }

    return newBuf
  };

  /*
   * Need to make sure that buffer isn't trying to write out of bounds.
   */
  function checkOffset (offset, ext, length) {
    if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
    if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
  }

  Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }

    return val
  };

  Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      checkOffset(offset, byteLength, this.length);
    }

    var val = this[offset + --byteLength];
    var mul = 1;
    while (byteLength > 0 && (mul *= 0x100)) {
      val += this[offset + --byteLength] * mul;
    }

    return val
  };

  Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length);
    return this[offset]
  };

  Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    return this[offset] | (this[offset + 1] << 8)
  };

  Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    return (this[offset] << 8) | this[offset + 1]
  };

  Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return ((this[offset]) |
        (this[offset + 1] << 8) |
        (this[offset + 2] << 16)) +
        (this[offset + 3] * 0x1000000)
  };

  Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
  };

  Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);

    return val
  };

  Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var i = byteLength;
    var mul = 1;
    var val = this[offset + --i];
    while (i > 0 && (mul *= 0x100)) {
      val += this[offset + --i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);

    return val
  };

  Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length);
    if (!(this[offset] & 0x80)) return (this[offset])
    return ((0xff - this[offset] + 1) * -1)
  };

  Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    var val = this[offset] | (this[offset + 1] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    var val = this[offset + 1] | (this[offset] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
  };

  Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
  };

  Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);
    return read(this, offset, true, 23, 4)
  };

  Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);
    return read(this, offset, false, 23, 4)
  };

  Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length);
    return read(this, offset, true, 52, 8)
  };

  Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length);
    return read(this, offset, false, 52, 8)
  };

  function checkInt (buf, value, offset, ext, max, min) {
    if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
    if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
  }

  Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var mul = 1;
    var i = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var i = byteLength - 1;
    var mul = 1;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
    if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
    this[offset] = (value & 0xff);
    return offset + 1
  };

  function objectWriteUInt16 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffff + value + 1;
    for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
      buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
        (littleEndian ? i : 1 - i) * 8;
    }
  }

  Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  function objectWriteUInt32 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffffffff + value + 1;
    for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
      buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
    }
  }

  Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset + 3] = (value >>> 24);
      this[offset + 2] = (value >>> 16);
      this[offset + 1] = (value >>> 8);
      this[offset] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = 0;
    var mul = 1;
    var sub = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = byteLength - 1;
    var mul = 1;
    var sub = 0;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -128);
    if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
    if (value < 0) value = 0xff + value + 1;
    this[offset] = (value & 0xff);
    return offset + 1
  };

  Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
      this[offset + 2] = (value >>> 16);
      this[offset + 3] = (value >>> 24);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
    if (value < 0) value = 0xffffffff + value + 1;
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  function checkIEEE754 (buf, value, offset, ext, max, min) {
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
    if (offset < 0) throw new RangeError('Index out of range')
  }

  function writeFloat (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 4);
    }
    write(buf, value, offset, littleEndian, 23, 4);
    return offset + 4
  }

  Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
    return writeFloat(this, value, offset, true, noAssert)
  };

  Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
    return writeFloat(this, value, offset, false, noAssert)
  };

  function writeDouble (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 8);
    }
    write(buf, value, offset, littleEndian, 52, 8);
    return offset + 8
  }

  Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
    return writeDouble(this, value, offset, true, noAssert)
  };

  Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
    return writeDouble(this, value, offset, false, noAssert)
  };

  // copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
  Buffer.prototype.copy = function copy (target, targetStart, start, end) {
    if (!start) start = 0;
    if (!end && end !== 0) end = this.length;
    if (targetStart >= target.length) targetStart = target.length;
    if (!targetStart) targetStart = 0;
    if (end > 0 && end < start) end = start;

    // Copy 0 bytes; we're done
    if (end === start) return 0
    if (target.length === 0 || this.length === 0) return 0

    // Fatal error conditions
    if (targetStart < 0) {
      throw new RangeError('targetStart out of bounds')
    }
    if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
    if (end < 0) throw new RangeError('sourceEnd out of bounds')

    // Are we oob?
    if (end > this.length) end = this.length;
    if (target.length - targetStart < end - start) {
      end = target.length - targetStart + start;
    }

    var len = end - start;
    var i;

    if (this === target && start < targetStart && targetStart < end) {
      // descending copy from end
      for (i = len - 1; i >= 0; --i) {
        target[i + targetStart] = this[i + start];
      }
    } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
      // ascending copy from start
      for (i = 0; i < len; ++i) {
        target[i + targetStart] = this[i + start];
      }
    } else {
      Uint8Array.prototype.set.call(
        target,
        this.subarray(start, start + len),
        targetStart
      );
    }

    return len
  };

  // Usage:
  //    buffer.fill(number[, offset[, end]])
  //    buffer.fill(buffer[, offset[, end]])
  //    buffer.fill(string[, offset[, end]][, encoding])
  Buffer.prototype.fill = function fill (val, start, end, encoding) {
    // Handle string cases:
    if (typeof val === 'string') {
      if (typeof start === 'string') {
        encoding = start;
        start = 0;
        end = this.length;
      } else if (typeof end === 'string') {
        encoding = end;
        end = this.length;
      }
      if (val.length === 1) {
        var code = val.charCodeAt(0);
        if (code < 256) {
          val = code;
        }
      }
      if (encoding !== undefined && typeof encoding !== 'string') {
        throw new TypeError('encoding must be a string')
      }
      if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
        throw new TypeError('Unknown encoding: ' + encoding)
      }
    } else if (typeof val === 'number') {
      val = val & 255;
    }

    // Invalid ranges are not set to a default, so can range check early.
    if (start < 0 || this.length < start || this.length < end) {
      throw new RangeError('Out of range index')
    }

    if (end <= start) {
      return this
    }

    start = start >>> 0;
    end = end === undefined ? this.length : end >>> 0;

    if (!val) val = 0;

    var i;
    if (typeof val === 'number') {
      for (i = start; i < end; ++i) {
        this[i] = val;
      }
    } else {
      var bytes = internalIsBuffer(val)
        ? val
        : utf8ToBytes(new Buffer(val, encoding).toString());
      var len = bytes.length;
      for (i = 0; i < end - start; ++i) {
        this[i + start] = bytes[i % len];
      }
    }

    return this
  };

  // HELPER FUNCTIONS
  // ================

  var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

  function base64clean (str) {
    // Node strips out invalid characters like \n and \t from the string, base64-js does not
    str = stringtrim(str).replace(INVALID_BASE64_RE, '');
    // Node converts strings with length < 2 to ''
    if (str.length < 2) return ''
    // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
    while (str.length % 4 !== 0) {
      str = str + '=';
    }
    return str
  }

  function stringtrim (str) {
    if (str.trim) return str.trim()
    return str.replace(/^\s+|\s+$/g, '')
  }

  function toHex (n) {
    if (n < 16) return '0' + n.toString(16)
    return n.toString(16)
  }

  function utf8ToBytes (string, units) {
    units = units || Infinity;
    var codePoint;
    var length = string.length;
    var leadSurrogate = null;
    var bytes = [];

    for (var i = 0; i < length; ++i) {
      codePoint = string.charCodeAt(i);

      // is surrogate component
      if (codePoint > 0xD7FF && codePoint < 0xE000) {
        // last char was a lead
        if (!leadSurrogate) {
          // no lead yet
          if (codePoint > 0xDBFF) {
            // unexpected trail
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
            continue
          } else if (i + 1 === length) {
            // unpaired lead
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
            continue
          }

          // valid lead
          leadSurrogate = codePoint;

          continue
        }

        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          leadSurrogate = codePoint;
          continue
        }

        // valid surrogate pair
        codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
      } else if (leadSurrogate) {
        // valid bmp char, but last char was a lead
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
      }

      leadSurrogate = null;

      // encode utf8
      if (codePoint < 0x80) {
        if ((units -= 1) < 0) break
        bytes.push(codePoint);
      } else if (codePoint < 0x800) {
        if ((units -= 2) < 0) break
        bytes.push(
          codePoint >> 0x6 | 0xC0,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x10000) {
        if ((units -= 3) < 0) break
        bytes.push(
          codePoint >> 0xC | 0xE0,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x110000) {
        if ((units -= 4) < 0) break
        bytes.push(
          codePoint >> 0x12 | 0xF0,
          codePoint >> 0xC & 0x3F | 0x80,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else {
        throw new Error('Invalid code point')
      }
    }

    return bytes
  }

  function asciiToBytes (str) {
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      // Node's code seems to be doing this and not & 0x7F..
      byteArray.push(str.charCodeAt(i) & 0xFF);
    }
    return byteArray
  }

  function utf16leToBytes (str, units) {
    var c, hi, lo;
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      if ((units -= 2) < 0) break

      c = str.charCodeAt(i);
      hi = c >> 8;
      lo = c % 256;
      byteArray.push(lo);
      byteArray.push(hi);
    }

    return byteArray
  }


  function base64ToBytes (str) {
    return toByteArray(base64clean(str))
  }

  function blitBuffer (src, dst, offset, length) {
    for (var i = 0; i < length; ++i) {
      if ((i + offset >= dst.length) || (i >= src.length)) break
      dst[i + offset] = src[i];
    }
    return i
  }

  function isnan (val) {
    return val !== val // eslint-disable-line no-self-compare
  }


  // the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
  // The _isBuffer check is for Safari 5-7 support, because it's missing
  // Object.prototype.constructor. Remove this eventually
  function isBuffer(obj) {
    return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
  }

  function isFastBuffer (obj) {
    return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
  }

  // For Node v0.10 support. Remove this eventually.
  function isSlowBuffer (obj) {
    return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
  }

  var dist = {};

  var utils$3 = {};

  var hasRequiredUtils$3;

  function requireUtils$3 () {
  	if (hasRequiredUtils$3) return utils$3;
  	hasRequiredUtils$3 = 1;
  	(function (exports) {
  		/**
  		 * Utilities for hex, bytes, CSPRNG.
  		 * @module
  		 */
  		/*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.wrapCipher = exports.Hash = exports.nextTick = exports.isLE = void 0;
  		exports.isBytes = isBytes;
  		exports.abool = abool;
  		exports.anumber = anumber;
  		exports.abytes = abytes;
  		exports.ahash = ahash;
  		exports.aexists = aexists;
  		exports.aoutput = aoutput;
  		exports.u8 = u8;
  		exports.u32 = u32;
  		exports.clean = clean;
  		exports.createView = createView;
  		exports.bytesToHex = bytesToHex;
  		exports.hexToBytes = hexToBytes;
  		exports.hexToNumber = hexToNumber;
  		exports.bytesToNumberBE = bytesToNumberBE;
  		exports.numberToBytesBE = numberToBytesBE;
  		exports.utf8ToBytes = utf8ToBytes;
  		exports.bytesToUtf8 = bytesToUtf8;
  		exports.toBytes = toBytes;
  		exports.overlapBytes = overlapBytes;
  		exports.complexOverlapBytes = complexOverlapBytes;
  		exports.concatBytes = concatBytes;
  		exports.checkOpts = checkOpts;
  		exports.equalBytes = equalBytes;
  		exports.getOutput = getOutput;
  		exports.setBigUint64 = setBigUint64;
  		exports.u64Lengths = u64Lengths;
  		exports.isAligned32 = isAligned32;
  		exports.copyBytes = copyBytes;
  		/** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
  		function isBytes(a) {
  		    return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
  		}
  		/** Asserts something is boolean. */
  		function abool(b) {
  		    if (typeof b !== 'boolean')
  		        throw new Error(`boolean expected, not ${b}`);
  		}
  		/** Asserts something is positive integer. */
  		function anumber(n) {
  		    if (!Number.isSafeInteger(n) || n < 0)
  		        throw new Error('positive integer expected, got ' + n);
  		}
  		/** Asserts something is Uint8Array. */
  		function abytes(b, ...lengths) {
  		    if (!isBytes(b))
  		        throw new Error('Uint8Array expected');
  		    if (lengths.length > 0 && !lengths.includes(b.length))
  		        throw new Error('Uint8Array expected of length ' + lengths + ', got length=' + b.length);
  		}
  		/**
  		 * Asserts something is hash
  		 * TODO: remove
  		 * @deprecated
  		 */
  		function ahash(h) {
  		    if (typeof h !== 'function' || typeof h.create !== 'function')
  		        throw new Error('Hash should be wrapped by utils.createHasher');
  		    anumber(h.outputLen);
  		    anumber(h.blockLen);
  		}
  		/** Asserts a hash instance has not been destroyed / finished */
  		function aexists(instance, checkFinished = true) {
  		    if (instance.destroyed)
  		        throw new Error('Hash instance has been destroyed');
  		    if (checkFinished && instance.finished)
  		        throw new Error('Hash#digest() has already been called');
  		}
  		/** Asserts output is properly-sized byte array */
  		function aoutput(out, instance) {
  		    abytes(out);
  		    const min = instance.outputLen;
  		    if (out.length < min) {
  		        throw new Error('digestInto() expects output buffer of length at least ' + min);
  		    }
  		}
  		/** Cast u8 / u16 / u32 to u8. */
  		function u8(arr) {
  		    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  		}
  		/** Cast u8 / u16 / u32 to u32. */
  		function u32(arr) {
  		    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  		}
  		/** Zeroize a byte array. Warning: JS provides no guarantees. */
  		function clean(...arrays) {
  		    for (let i = 0; i < arrays.length; i++) {
  		        arrays[i].fill(0);
  		    }
  		}
  		/** Create DataView of an array for easy byte-level manipulation. */
  		function createView(arr) {
  		    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  		}
  		/** Is current platform little-endian? Most are. Big-Endian platform: IBM */
  		exports.isLE = (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
  		// Built-in hex conversion https://caniuse.com/mdn-javascript_builtins_uint8array_fromhex
  		const hasHexBuiltin = /* @__PURE__ */ (() => 
  		// @ts-ignore
  		typeof Uint8Array.from([]).toHex === 'function' && typeof Uint8Array.fromHex === 'function')();
  		// Array where index 0xf0 (240) is mapped to string 'f0'
  		const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
  		/**
  		 * Convert byte array to hex string. Uses built-in function, when available.
  		 * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
  		 */
  		function bytesToHex(bytes) {
  		    abytes(bytes);
  		    // @ts-ignore
  		    if (hasHexBuiltin)
  		        return bytes.toHex();
  		    // pre-caching improves the speed 6x
  		    let hex = '';
  		    for (let i = 0; i < bytes.length; i++) {
  		        hex += hexes[bytes[i]];
  		    }
  		    return hex;
  		}
  		// We use optimized technique to convert hex string to byte array
  		const asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
  		function asciiToBase16(ch) {
  		    if (ch >= asciis._0 && ch <= asciis._9)
  		        return ch - asciis._0; // '2' => 50-48
  		    if (ch >= asciis.A && ch <= asciis.F)
  		        return ch - (asciis.A - 10); // 'B' => 66-(65-10)
  		    if (ch >= asciis.a && ch <= asciis.f)
  		        return ch - (asciis.a - 10); // 'b' => 98-(97-10)
  		    return;
  		}
  		/**
  		 * Convert hex string to byte array. Uses built-in function, when available.
  		 * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
  		 */
  		function hexToBytes(hex) {
  		    if (typeof hex !== 'string')
  		        throw new Error('hex string expected, got ' + typeof hex);
  		    // @ts-ignore
  		    if (hasHexBuiltin)
  		        return Uint8Array.fromHex(hex);
  		    const hl = hex.length;
  		    const al = hl / 2;
  		    if (hl % 2)
  		        throw new Error('hex string expected, got unpadded hex of length ' + hl);
  		    const array = new Uint8Array(al);
  		    for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
  		        const n1 = asciiToBase16(hex.charCodeAt(hi));
  		        const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
  		        if (n1 === undefined || n2 === undefined) {
  		            const char = hex[hi] + hex[hi + 1];
  		            throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
  		        }
  		        array[ai] = n1 * 16 + n2; // multiply first octet, e.g. 'a3' => 10*16+3 => 160 + 3 => 163
  		    }
  		    return array;
  		}
  		// Used in micro
  		function hexToNumber(hex) {
  		    if (typeof hex !== 'string')
  		        throw new Error('hex string expected, got ' + typeof hex);
  		    return BigInt(hex === '' ? '0' : '0x' + hex); // Big Endian
  		}
  		// Used in ff1
  		// BE: Big Endian, LE: Little Endian
  		function bytesToNumberBE(bytes) {
  		    return hexToNumber(bytesToHex(bytes));
  		}
  		// Used in micro, ff1
  		function numberToBytesBE(n, len) {
  		    return hexToBytes(n.toString(16).padStart(len * 2, '0'));
  		}
  		// TODO: remove
  		// There is no setImmediate in browser and setTimeout is slow.
  		// call of async fn will return Promise, which will be fullfiled only on
  		// next scheduler queue processing step and this is exactly what we need.
  		const nextTick = async () => { };
  		exports.nextTick = nextTick;
  		/**
  		 * Converts string to bytes using UTF8 encoding.
  		 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
  		 */
  		function utf8ToBytes(str) {
  		    if (typeof str !== 'string')
  		        throw new Error('string expected');
  		    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
  		}
  		/**
  		 * Converts bytes to string using UTF8 encoding.
  		 * @example bytesToUtf8(new Uint8Array([97, 98, 99])) // 'abc'
  		 */
  		function bytesToUtf8(bytes) {
  		    return new TextDecoder().decode(bytes);
  		}
  		/**
  		 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
  		 * Warning: when Uint8Array is passed, it would NOT get copied.
  		 * Keep in mind for future mutable operations.
  		 */
  		function toBytes(data) {
  		    if (typeof data === 'string')
  		        data = utf8ToBytes(data);
  		    else if (isBytes(data))
  		        data = copyBytes(data);
  		    else
  		        throw new Error('Uint8Array expected, got ' + typeof data);
  		    return data;
  		}
  		/**
  		 * Checks if two U8A use same underlying buffer and overlaps.
  		 * This is invalid and can corrupt data.
  		 */
  		function overlapBytes(a, b) {
  		    return (a.buffer === b.buffer && // best we can do, may fail with an obscure Proxy
  		        a.byteOffset < b.byteOffset + b.byteLength && // a starts before b end
  		        b.byteOffset < a.byteOffset + a.byteLength // b starts before a end
  		    );
  		}
  		/**
  		 * If input and output overlap and input starts before output, we will overwrite end of input before
  		 * we start processing it, so this is not supported for most ciphers (except chacha/salse, which designed with this)
  		 */
  		function complexOverlapBytes(input, output) {
  		    // This is very cursed. It works somehow, but I'm completely unsure,
  		    // reasoning about overlapping aligned windows is very hard.
  		    if (overlapBytes(input, output) && input.byteOffset < output.byteOffset)
  		        throw new Error('complex overlap of input and output is not supported');
  		}
  		/**
  		 * Copies several Uint8Arrays into one.
  		 */
  		function concatBytes(...arrays) {
  		    let sum = 0;
  		    for (let i = 0; i < arrays.length; i++) {
  		        const a = arrays[i];
  		        abytes(a);
  		        sum += a.length;
  		    }
  		    const res = new Uint8Array(sum);
  		    for (let i = 0, pad = 0; i < arrays.length; i++) {
  		        const a = arrays[i];
  		        res.set(a, pad);
  		        pad += a.length;
  		    }
  		    return res;
  		}
  		function checkOpts(defaults, opts) {
  		    if (opts == null || typeof opts !== 'object')
  		        throw new Error('options must be defined');
  		    const merged = Object.assign(defaults, opts);
  		    return merged;
  		}
  		/** Compares 2 uint8array-s in kinda constant time. */
  		function equalBytes(a, b) {
  		    if (a.length !== b.length)
  		        return false;
  		    let diff = 0;
  		    for (let i = 0; i < a.length; i++)
  		        diff |= a[i] ^ b[i];
  		    return diff === 0;
  		}
  		// TODO: remove
  		/** For runtime check if class implements interface. */
  		class Hash {
  		}
  		exports.Hash = Hash;
  		/**
  		 * Wraps a cipher: validates args, ensures encrypt() can only be called once.
  		 * @__NO_SIDE_EFFECTS__
  		 */
  		const wrapCipher = (params, constructor) => {
  		    function wrappedCipher(key, ...args) {
  		        // Validate key
  		        abytes(key);
  		        // Big-Endian hardware is rare. Just in case someone still decides to run ciphers:
  		        if (!exports.isLE)
  		            throw new Error('Non little-endian hardware is not yet supported');
  		        // Validate nonce if nonceLength is present
  		        if (params.nonceLength !== undefined) {
  		            const nonce = args[0];
  		            if (!nonce)
  		                throw new Error('nonce / iv required');
  		            if (params.varSizeNonce)
  		                abytes(nonce);
  		            else
  		                abytes(nonce, params.nonceLength);
  		        }
  		        // Validate AAD if tagLength present
  		        const tagl = params.tagLength;
  		        if (tagl && args[1] !== undefined) {
  		            abytes(args[1]);
  		        }
  		        const cipher = constructor(key, ...args);
  		        const checkOutput = (fnLength, output) => {
  		            if (output !== undefined) {
  		                if (fnLength !== 2)
  		                    throw new Error('cipher output not supported');
  		                abytes(output);
  		            }
  		        };
  		        // Create wrapped cipher with validation and single-use encryption
  		        let called = false;
  		        const wrCipher = {
  		            encrypt(data, output) {
  		                if (called)
  		                    throw new Error('cannot encrypt() twice with same key + nonce');
  		                called = true;
  		                abytes(data);
  		                checkOutput(cipher.encrypt.length, output);
  		                return cipher.encrypt(data, output);
  		            },
  		            decrypt(data, output) {
  		                abytes(data);
  		                if (tagl && data.length < tagl)
  		                    throw new Error('invalid ciphertext length: smaller than tagLength=' + tagl);
  		                checkOutput(cipher.decrypt.length, output);
  		                return cipher.decrypt(data, output);
  		            },
  		        };
  		        return wrCipher;
  		    }
  		    Object.assign(wrappedCipher, params);
  		    return wrappedCipher;
  		};
  		exports.wrapCipher = wrapCipher;
  		/**
  		 * By default, returns u8a of length.
  		 * When out is available, it checks it for validity and uses it.
  		 */
  		function getOutput(expectedLength, out, onlyAligned = true) {
  		    if (out === undefined)
  		        return new Uint8Array(expectedLength);
  		    if (out.length !== expectedLength)
  		        throw new Error('invalid output length, expected ' + expectedLength + ', got: ' + out.length);
  		    if (onlyAligned && !isAligned32(out))
  		        throw new Error('invalid output, must be aligned');
  		    return out;
  		}
  		/** Polyfill for Safari 14. */
  		function setBigUint64(view, byteOffset, value, isLE) {
  		    if (typeof view.setBigUint64 === 'function')
  		        return view.setBigUint64(byteOffset, value, isLE);
  		    const _32n = BigInt(32);
  		    const _u32_max = BigInt(0xffffffff);
  		    const wh = Number((value >> _32n) & _u32_max);
  		    const wl = Number(value & _u32_max);
  		    const h = isLE ? 4 : 0;
  		    const l = isLE ? 0 : 4;
  		    view.setUint32(byteOffset + h, wh, isLE);
  		    view.setUint32(byteOffset + l, wl, isLE);
  		}
  		function u64Lengths(dataLength, aadLength, isLE) {
  		    abool(isLE);
  		    const num = new Uint8Array(16);
  		    const view = createView(num);
  		    setBigUint64(view, 0, BigInt(aadLength), isLE);
  		    setBigUint64(view, 8, BigInt(dataLength), isLE);
  		    return num;
  		}
  		// Is byte array aligned to 4 byte offset (u32)?
  		function isAligned32(bytes) {
  		    return bytes.byteOffset % 4 === 0;
  		}
  		// copy bytes to new u8a (aligned). Because Buffer.slice is broken.
  		function copyBytes(bytes) {
  		    return Uint8Array.from(bytes);
  		}
  		
  	} (utils$3));
  	return utils$3;
  }

  var config = {};

  var consts = {};

  var hasRequiredConsts;

  function requireConsts () {
  	if (hasRequiredConsts) return consts;
  	hasRequiredConsts = 1;
  	Object.defineProperty(consts, "__esModule", { value: true });
  	consts.AEAD_TAG_LENGTH = consts.XCHACHA20_NONCE_LENGTH = consts.CURVE25519_PUBLIC_KEY_SIZE = consts.ETH_PUBLIC_KEY_SIZE = consts.UNCOMPRESSED_PUBLIC_KEY_SIZE = consts.COMPRESSED_PUBLIC_KEY_SIZE = consts.SECRET_KEY_LENGTH = void 0;
  	// elliptic
  	consts.SECRET_KEY_LENGTH = 32;
  	consts.COMPRESSED_PUBLIC_KEY_SIZE = 33;
  	consts.UNCOMPRESSED_PUBLIC_KEY_SIZE = 65;
  	consts.ETH_PUBLIC_KEY_SIZE = 64;
  	consts.CURVE25519_PUBLIC_KEY_SIZE = 32;
  	// symmetric
  	consts.XCHACHA20_NONCE_LENGTH = 24;
  	consts.AEAD_TAG_LENGTH = 16;
  	return consts;
  }

  var hasRequiredConfig;

  function requireConfig () {
  	if (hasRequiredConfig) return config;
  	hasRequiredConfig = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.ephemeralKeySize = exports.symmetricNonceLength = exports.symmetricAlgorithm = exports.isHkdfKeyCompressed = exports.isEphemeralKeyCompressed = exports.ellipticCurve = exports.ECIES_CONFIG = void 0;
  		var consts_1 = requireConsts();
  		var Config = /** @class */ (function () {
  		    function Config() {
  		        this.ellipticCurve = "secp256k1";
  		        this.isEphemeralKeyCompressed = false; // secp256k1 only
  		        this.isHkdfKeyCompressed = false; // secp256k1 only
  		        this.symmetricAlgorithm = "aes-256-gcm";
  		        this.symmetricNonceLength = 16; // aes-256-gcm only
  		    }
  		    return Config;
  		}());
  		exports.ECIES_CONFIG = new Config();
  		var ellipticCurve = function () { return exports.ECIES_CONFIG.ellipticCurve; };
  		exports.ellipticCurve = ellipticCurve;
  		var isEphemeralKeyCompressed = function () { return exports.ECIES_CONFIG.isEphemeralKeyCompressed; };
  		exports.isEphemeralKeyCompressed = isEphemeralKeyCompressed;
  		var isHkdfKeyCompressed = function () { return exports.ECIES_CONFIG.isHkdfKeyCompressed; };
  		exports.isHkdfKeyCompressed = isHkdfKeyCompressed;
  		var symmetricAlgorithm = function () { return exports.ECIES_CONFIG.symmetricAlgorithm; };
  		exports.symmetricAlgorithm = symmetricAlgorithm;
  		var symmetricNonceLength = function () { return exports.ECIES_CONFIG.symmetricNonceLength; };
  		exports.symmetricNonceLength = symmetricNonceLength;
  		var ephemeralKeySize = function () {
  		    var mapping = {
  		        secp256k1: exports.ECIES_CONFIG.isEphemeralKeyCompressed
  		            ? consts_1.COMPRESSED_PUBLIC_KEY_SIZE
  		            : consts_1.UNCOMPRESSED_PUBLIC_KEY_SIZE,
  		        x25519: consts_1.CURVE25519_PUBLIC_KEY_SIZE,
  		        ed25519: consts_1.CURVE25519_PUBLIC_KEY_SIZE,
  		    };
  		    if (exports.ECIES_CONFIG.ellipticCurve in mapping) {
  		        return mapping[exports.ECIES_CONFIG.ellipticCurve];
  		    } /* v8 ignore next 2 */
  		    else {
  		        throw new Error("Not implemented");
  		    }
  		};
  		exports.ephemeralKeySize = ephemeralKeySize; 
  	} (config));
  	return config;
  }

  var keys = {};

  var PrivateKey = {};

  var utils$2 = {};

  var elliptic = {};

  var webcrypto = {};

  var crypto$1 = {};

  var hasRequiredCrypto$1;

  function requireCrypto$1 () {
  	if (hasRequiredCrypto$1) return crypto$1;
  	hasRequiredCrypto$1 = 1;
  	Object.defineProperty(crypto$1, "__esModule", { value: true });
  	crypto$1.crypto = void 0;
  	crypto$1.crypto = typeof globalThis === 'object' && 'crypto' in globalThis ? globalThis.crypto : undefined;
  	
  	return crypto$1;
  }

  var hasRequiredWebcrypto;

  function requireWebcrypto () {
  	if (hasRequiredWebcrypto) return webcrypto;
  	hasRequiredWebcrypto = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.gcm = exports.ctr = exports.cbc = exports.utils = void 0;
  		exports.randomBytes = randomBytes;
  		exports.getWebcryptoSubtle = getWebcryptoSubtle;
  		exports.managedNonce = managedNonce;
  		/**
  		 * WebCrypto-based AES gcm/ctr/cbc, `managedNonce` and `randomBytes`.
  		 * We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
  		 * node.js versions earlier than v19 don't declare it in global scope.
  		 * For node.js, package.js on#exports field mapping rewrites import
  		 * from `crypto` to `cryptoNode`, which imports native module.
  		 * Makes the utils un-importable in browsers without a bundler.
  		 * Once node.js 18 is deprecated, we can just drop the import.
  		 * @module
  		 */
  		// Use full path so that Node.js can rewrite it to `cryptoNode.js`.
  		const crypto_1 = requireCrypto$1();
  		const utils_ts_1 = /*@__PURE__*/ requireUtils$3();
  		/**
  		 * Secure PRNG. Uses `crypto.getRandomValues`, which defers to OS.
  		 */
  		function randomBytes(bytesLength = 32) {
  		    if (crypto_1.crypto && typeof crypto_1.crypto.getRandomValues === 'function') {
  		        return crypto_1.crypto.getRandomValues(new Uint8Array(bytesLength));
  		    }
  		    // Legacy Node.js compatibility
  		    if (crypto_1.crypto && typeof crypto_1.crypto.randomBytes === 'function') {
  		        return Uint8Array.from(crypto_1.crypto.randomBytes(bytesLength));
  		    }
  		    throw new Error('crypto.getRandomValues must be defined');
  		}
  		function getWebcryptoSubtle() {
  		    if (crypto_1.crypto && typeof crypto_1.crypto.subtle === 'object' && crypto_1.crypto.subtle != null)
  		        return crypto_1.crypto.subtle;
  		    throw new Error('crypto.subtle must be defined');
  		}
  		/**
  		 * Uses CSPRG for nonce, nonce injected in ciphertext.
  		 * @example
  		 * const gcm = managedNonce(aes.gcm);
  		 * const ciphr = gcm(key).encrypt(data);
  		 * const plain = gcm(key).decrypt(ciph);
  		 */
  		function managedNonce(fn) {
  		    const { nonceLength } = fn;
  		    (0, utils_ts_1.anumber)(nonceLength);
  		    return ((key, ...args) => ({
  		        encrypt(plaintext, ...argsEnc) {
  		            const nonce = randomBytes(nonceLength);
  		            const ciphertext = fn(key, nonce, ...args).encrypt(plaintext, ...argsEnc);
  		            const out = (0, utils_ts_1.concatBytes)(nonce, ciphertext);
  		            ciphertext.fill(0);
  		            return out;
  		        },
  		        decrypt(ciphertext, ...argsDec) {
  		            const nonce = ciphertext.subarray(0, nonceLength);
  		            const data = ciphertext.subarray(nonceLength);
  		            return fn(key, nonce, ...args).decrypt(data, ...argsDec);
  		        },
  		    }));
  		}
  		// Overridable
  		// @TODO
  		exports.utils = {
  		    async encrypt(key, keyParams, cryptParams, plaintext) {
  		        const cr = getWebcryptoSubtle();
  		        const iKey = await cr.importKey('raw', key, keyParams, true, ['encrypt']);
  		        const ciphertext = await cr.encrypt(cryptParams, iKey, plaintext);
  		        return new Uint8Array(ciphertext);
  		    },
  		    async decrypt(key, keyParams, cryptParams, ciphertext) {
  		        const cr = getWebcryptoSubtle();
  		        const iKey = await cr.importKey('raw', key, keyParams, true, ['decrypt']);
  		        const plaintext = await cr.decrypt(cryptParams, iKey, ciphertext);
  		        return new Uint8Array(plaintext);
  		    },
  		};
  		const mode = {
  		    CBC: 'AES-CBC',
  		    CTR: 'AES-CTR',
  		    GCM: 'AES-GCM',
  		};
  		function getCryptParams(algo, nonce, AAD) {
  		    if (algo === mode.CBC)
  		        return { name: mode.CBC, iv: nonce };
  		    if (algo === mode.CTR)
  		        return { name: mode.CTR, counter: nonce, length: 64 };
  		    if (algo === mode.GCM) {
  		        if (AAD)
  		            return { name: mode.GCM, iv: nonce, additionalData: AAD };
  		        else
  		            return { name: mode.GCM, iv: nonce };
  		    }
  		    throw new Error('unknown aes block mode');
  		}
  		function generate(algo) {
  		    return (key, nonce, AAD) => {
  		        (0, utils_ts_1.abytes)(key);
  		        (0, utils_ts_1.abytes)(nonce);
  		        const keyParams = { name: algo, length: key.length * 8 };
  		        const cryptParams = getCryptParams(algo, nonce, AAD);
  		        let consumed = false;
  		        return {
  		            // keyLength,
  		            encrypt(plaintext) {
  		                (0, utils_ts_1.abytes)(plaintext);
  		                if (consumed)
  		                    throw new Error('Cannot encrypt() twice with same key / nonce');
  		                consumed = true;
  		                return exports.utils.encrypt(key, keyParams, cryptParams, plaintext);
  		            },
  		            decrypt(ciphertext) {
  		                (0, utils_ts_1.abytes)(ciphertext);
  		                return exports.utils.decrypt(key, keyParams, cryptParams, ciphertext);
  		            },
  		        };
  		    };
  		}
  		/** AES-CBC, native webcrypto version */
  		exports.cbc = (() => generate(mode.CBC))();
  		/** AES-CTR, native webcrypto version */
  		exports.ctr = (() => generate(mode.CTR))();
  		/** AES-GCM, native webcrypto version */
  		exports.gcm = 
  		/* @__PURE__ */ (() => generate(mode.GCM))();
  		// // Type tests
  		// import { siv, gcm, ctr, ecb, cbc } from '../aes.ts';
  		// import { xsalsa20poly1305 } from '../salsa.ts';
  		// import { chacha20poly1305, xchacha20poly1305 } from '../chacha.ts';
  		// const wsiv = managedNonce(siv);
  		// const wgcm = managedNonce(gcm);
  		// const wctr = managedNonce(ctr);
  		// const wcbc = managedNonce(cbc);
  		// const wsalsapoly = managedNonce(xsalsa20poly1305);
  		// const wchacha = managedNonce(chacha20poly1305);
  		// const wxchacha = managedNonce(xchacha20poly1305);
  		// // should fail
  		// const wcbc2 = managedNonce(managedNonce(cbc));
  		// const wctr = managedNonce(ctr);
  		
  	} (webcrypto));
  	return webcrypto;
  }

  var ed25519 = {};

  var sha2 = {};

  var _md = {};

  var utils$1 = {};

  var crypto = {};

  var hasRequiredCrypto;

  function requireCrypto () {
  	if (hasRequiredCrypto) return crypto;
  	hasRequiredCrypto = 1;
  	Object.defineProperty(crypto, "__esModule", { value: true });
  	crypto.crypto = void 0;
  	crypto.crypto = typeof globalThis === 'object' && 'crypto' in globalThis ? globalThis.crypto : undefined;
  	
  	return crypto;
  }

  var hasRequiredUtils$2;

  function requireUtils$2 () {
  	if (hasRequiredUtils$2) return utils$1;
  	hasRequiredUtils$2 = 1;
  	(function (exports) {
  		/**
  		 * Utilities for hex, bytes, CSPRNG.
  		 * @module
  		 */
  		/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.wrapXOFConstructorWithOpts = exports.wrapConstructorWithOpts = exports.wrapConstructor = exports.Hash = exports.nextTick = exports.swap32IfBE = exports.byteSwapIfBE = exports.swap8IfBE = exports.isLE = void 0;
  		exports.isBytes = isBytes;
  		exports.anumber = anumber;
  		exports.abytes = abytes;
  		exports.ahash = ahash;
  		exports.aexists = aexists;
  		exports.aoutput = aoutput;
  		exports.u8 = u8;
  		exports.u32 = u32;
  		exports.clean = clean;
  		exports.createView = createView;
  		exports.rotr = rotr;
  		exports.rotl = rotl;
  		exports.byteSwap = byteSwap;
  		exports.byteSwap32 = byteSwap32;
  		exports.bytesToHex = bytesToHex;
  		exports.hexToBytes = hexToBytes;
  		exports.asyncLoop = asyncLoop;
  		exports.utf8ToBytes = utf8ToBytes;
  		exports.bytesToUtf8 = bytesToUtf8;
  		exports.toBytes = toBytes;
  		exports.kdfInputToBytes = kdfInputToBytes;
  		exports.concatBytes = concatBytes;
  		exports.checkOpts = checkOpts;
  		exports.createHasher = createHasher;
  		exports.createOptHasher = createOptHasher;
  		exports.createXOFer = createXOFer;
  		exports.randomBytes = randomBytes;
  		// We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
  		// node.js versions earlier than v19 don't declare it in global scope.
  		// For node.js, package.json#exports field mapping rewrites import
  		// from `crypto` to `cryptoNode`, which imports native module.
  		// Makes the utils un-importable in browsers without a bundler.
  		// Once node.js 18 is deprecated (2025-04-30), we can just drop the import.
  		const crypto_1 = requireCrypto();
  		/** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
  		function isBytes(a) {
  		    return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
  		}
  		/** Asserts something is positive integer. */
  		function anumber(n) {
  		    if (!Number.isSafeInteger(n) || n < 0)
  		        throw new Error('positive integer expected, got ' + n);
  		}
  		/** Asserts something is Uint8Array. */
  		function abytes(b, ...lengths) {
  		    if (!isBytes(b))
  		        throw new Error('Uint8Array expected');
  		    if (lengths.length > 0 && !lengths.includes(b.length))
  		        throw new Error('Uint8Array expected of length ' + lengths + ', got length=' + b.length);
  		}
  		/** Asserts something is hash */
  		function ahash(h) {
  		    if (typeof h !== 'function' || typeof h.create !== 'function')
  		        throw new Error('Hash should be wrapped by utils.createHasher');
  		    anumber(h.outputLen);
  		    anumber(h.blockLen);
  		}
  		/** Asserts a hash instance has not been destroyed / finished */
  		function aexists(instance, checkFinished = true) {
  		    if (instance.destroyed)
  		        throw new Error('Hash instance has been destroyed');
  		    if (checkFinished && instance.finished)
  		        throw new Error('Hash#digest() has already been called');
  		}
  		/** Asserts output is properly-sized byte array */
  		function aoutput(out, instance) {
  		    abytes(out);
  		    const min = instance.outputLen;
  		    if (out.length < min) {
  		        throw new Error('digestInto() expects output buffer of length at least ' + min);
  		    }
  		}
  		/** Cast u8 / u16 / u32 to u8. */
  		function u8(arr) {
  		    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  		}
  		/** Cast u8 / u16 / u32 to u32. */
  		function u32(arr) {
  		    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  		}
  		/** Zeroize a byte array. Warning: JS provides no guarantees. */
  		function clean(...arrays) {
  		    for (let i = 0; i < arrays.length; i++) {
  		        arrays[i].fill(0);
  		    }
  		}
  		/** Create DataView of an array for easy byte-level manipulation. */
  		function createView(arr) {
  		    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  		}
  		/** The rotate right (circular right shift) operation for uint32 */
  		function rotr(word, shift) {
  		    return (word << (32 - shift)) | (word >>> shift);
  		}
  		/** The rotate left (circular left shift) operation for uint32 */
  		function rotl(word, shift) {
  		    return (word << shift) | ((word >>> (32 - shift)) >>> 0);
  		}
  		/** Is current platform little-endian? Most are. Big-Endian platform: IBM */
  		exports.isLE = (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
  		/** The byte swap operation for uint32 */
  		function byteSwap(word) {
  		    return (((word << 24) & 0xff000000) |
  		        ((word << 8) & 0xff0000) |
  		        ((word >>> 8) & 0xff00) |
  		        ((word >>> 24) & 0xff));
  		}
  		/** Conditionally byte swap if on a big-endian platform */
  		exports.swap8IfBE = exports.isLE
  		    ? (n) => n
  		    : (n) => byteSwap(n);
  		/** @deprecated */
  		exports.byteSwapIfBE = exports.swap8IfBE;
  		/** In place byte swap for Uint32Array */
  		function byteSwap32(arr) {
  		    for (let i = 0; i < arr.length; i++) {
  		        arr[i] = byteSwap(arr[i]);
  		    }
  		    return arr;
  		}
  		exports.swap32IfBE = exports.isLE
  		    ? (u) => u
  		    : byteSwap32;
  		// Built-in hex conversion https://caniuse.com/mdn-javascript_builtins_uint8array_fromhex
  		const hasHexBuiltin = /* @__PURE__ */ (() => 
  		// @ts-ignore
  		typeof Uint8Array.from([]).toHex === 'function' && typeof Uint8Array.fromHex === 'function')();
  		// Array where index 0xf0 (240) is mapped to string 'f0'
  		const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
  		/**
  		 * Convert byte array to hex string. Uses built-in function, when available.
  		 * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
  		 */
  		function bytesToHex(bytes) {
  		    abytes(bytes);
  		    // @ts-ignore
  		    if (hasHexBuiltin)
  		        return bytes.toHex();
  		    // pre-caching improves the speed 6x
  		    let hex = '';
  		    for (let i = 0; i < bytes.length; i++) {
  		        hex += hexes[bytes[i]];
  		    }
  		    return hex;
  		}
  		// We use optimized technique to convert hex string to byte array
  		const asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
  		function asciiToBase16(ch) {
  		    if (ch >= asciis._0 && ch <= asciis._9)
  		        return ch - asciis._0; // '2' => 50-48
  		    if (ch >= asciis.A && ch <= asciis.F)
  		        return ch - (asciis.A - 10); // 'B' => 66-(65-10)
  		    if (ch >= asciis.a && ch <= asciis.f)
  		        return ch - (asciis.a - 10); // 'b' => 98-(97-10)
  		    return;
  		}
  		/**
  		 * Convert hex string to byte array. Uses built-in function, when available.
  		 * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
  		 */
  		function hexToBytes(hex) {
  		    if (typeof hex !== 'string')
  		        throw new Error('hex string expected, got ' + typeof hex);
  		    // @ts-ignore
  		    if (hasHexBuiltin)
  		        return Uint8Array.fromHex(hex);
  		    const hl = hex.length;
  		    const al = hl / 2;
  		    if (hl % 2)
  		        throw new Error('hex string expected, got unpadded hex of length ' + hl);
  		    const array = new Uint8Array(al);
  		    for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
  		        const n1 = asciiToBase16(hex.charCodeAt(hi));
  		        const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
  		        if (n1 === undefined || n2 === undefined) {
  		            const char = hex[hi] + hex[hi + 1];
  		            throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
  		        }
  		        array[ai] = n1 * 16 + n2; // multiply first octet, e.g. 'a3' => 10*16+3 => 160 + 3 => 163
  		    }
  		    return array;
  		}
  		/**
  		 * There is no setImmediate in browser and setTimeout is slow.
  		 * Call of async fn will return Promise, which will be fullfiled only on
  		 * next scheduler queue processing step and this is exactly what we need.
  		 */
  		const nextTick = async () => { };
  		exports.nextTick = nextTick;
  		/** Returns control to thread each 'tick' ms to avoid blocking. */
  		async function asyncLoop(iters, tick, cb) {
  		    let ts = Date.now();
  		    for (let i = 0; i < iters; i++) {
  		        cb(i);
  		        // Date.now() is not monotonic, so in case if clock goes backwards we return return control too
  		        const diff = Date.now() - ts;
  		        if (diff >= 0 && diff < tick)
  		            continue;
  		        await (0, exports.nextTick)();
  		        ts += diff;
  		    }
  		}
  		/**
  		 * Converts string to bytes using UTF8 encoding.
  		 * @example utf8ToBytes('abc') // Uint8Array.from([97, 98, 99])
  		 */
  		function utf8ToBytes(str) {
  		    if (typeof str !== 'string')
  		        throw new Error('string expected');
  		    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
  		}
  		/**
  		 * Converts bytes to string using UTF8 encoding.
  		 * @example bytesToUtf8(Uint8Array.from([97, 98, 99])) // 'abc'
  		 */
  		function bytesToUtf8(bytes) {
  		    return new TextDecoder().decode(bytes);
  		}
  		/**
  		 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
  		 * Warning: when Uint8Array is passed, it would NOT get copied.
  		 * Keep in mind for future mutable operations.
  		 */
  		function toBytes(data) {
  		    if (typeof data === 'string')
  		        data = utf8ToBytes(data);
  		    abytes(data);
  		    return data;
  		}
  		/**
  		 * Helper for KDFs: consumes uint8array or string.
  		 * When string is passed, does utf8 decoding, using TextDecoder.
  		 */
  		function kdfInputToBytes(data) {
  		    if (typeof data === 'string')
  		        data = utf8ToBytes(data);
  		    abytes(data);
  		    return data;
  		}
  		/** Copies several Uint8Arrays into one. */
  		function concatBytes(...arrays) {
  		    let sum = 0;
  		    for (let i = 0; i < arrays.length; i++) {
  		        const a = arrays[i];
  		        abytes(a);
  		        sum += a.length;
  		    }
  		    const res = new Uint8Array(sum);
  		    for (let i = 0, pad = 0; i < arrays.length; i++) {
  		        const a = arrays[i];
  		        res.set(a, pad);
  		        pad += a.length;
  		    }
  		    return res;
  		}
  		function checkOpts(defaults, opts) {
  		    if (opts !== undefined && {}.toString.call(opts) !== '[object Object]')
  		        throw new Error('options should be object or undefined');
  		    const merged = Object.assign(defaults, opts);
  		    return merged;
  		}
  		/** For runtime check if class implements interface */
  		class Hash {
  		}
  		exports.Hash = Hash;
  		/** Wraps hash function, creating an interface on top of it */
  		function createHasher(hashCons) {
  		    const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  		    const tmp = hashCons();
  		    hashC.outputLen = tmp.outputLen;
  		    hashC.blockLen = tmp.blockLen;
  		    hashC.create = () => hashCons();
  		    return hashC;
  		}
  		function createOptHasher(hashCons) {
  		    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
  		    const tmp = hashCons({});
  		    hashC.outputLen = tmp.outputLen;
  		    hashC.blockLen = tmp.blockLen;
  		    hashC.create = (opts) => hashCons(opts);
  		    return hashC;
  		}
  		function createXOFer(hashCons) {
  		    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
  		    const tmp = hashCons({});
  		    hashC.outputLen = tmp.outputLen;
  		    hashC.blockLen = tmp.blockLen;
  		    hashC.create = (opts) => hashCons(opts);
  		    return hashC;
  		}
  		exports.wrapConstructor = createHasher;
  		exports.wrapConstructorWithOpts = createOptHasher;
  		exports.wrapXOFConstructorWithOpts = createXOFer;
  		/** Cryptographically secure PRNG. Uses internal OS-level `crypto.getRandomValues`. */
  		function randomBytes(bytesLength = 32) {
  		    if (crypto_1.crypto && typeof crypto_1.crypto.getRandomValues === 'function') {
  		        return crypto_1.crypto.getRandomValues(new Uint8Array(bytesLength));
  		    }
  		    // Legacy Node.js compatibility
  		    if (crypto_1.crypto && typeof crypto_1.crypto.randomBytes === 'function') {
  		        return Uint8Array.from(crypto_1.crypto.randomBytes(bytesLength));
  		    }
  		    throw new Error('crypto.getRandomValues must be defined');
  		}
  		
  	} (utils$1));
  	return utils$1;
  }

  var hasRequired_md;

  function require_md () {
  	if (hasRequired_md) return _md;
  	hasRequired_md = 1;
  	Object.defineProperty(_md, "__esModule", { value: true });
  	_md.SHA512_IV = _md.SHA384_IV = _md.SHA224_IV = _md.SHA256_IV = _md.HashMD = void 0;
  	_md.setBigUint64 = setBigUint64;
  	_md.Chi = Chi;
  	_md.Maj = Maj;
  	/**
  	 * Internal Merkle-Damgard hash utils.
  	 * @module
  	 */
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$2();
  	/** Polyfill for Safari 14. https://caniuse.com/mdn-javascript_builtins_dataview_setbiguint64 */
  	function setBigUint64(view, byteOffset, value, isLE) {
  	    if (typeof view.setBigUint64 === 'function')
  	        return view.setBigUint64(byteOffset, value, isLE);
  	    const _32n = BigInt(32);
  	    const _u32_max = BigInt(0xffffffff);
  	    const wh = Number((value >> _32n) & _u32_max);
  	    const wl = Number(value & _u32_max);
  	    const h = isLE ? 4 : 0;
  	    const l = isLE ? 0 : 4;
  	    view.setUint32(byteOffset + h, wh, isLE);
  	    view.setUint32(byteOffset + l, wl, isLE);
  	}
  	/** Choice: a ? b : c */
  	function Chi(a, b, c) {
  	    return (a & b) ^ (~a & c);
  	}
  	/** Majority function, true if any two inputs is true. */
  	function Maj(a, b, c) {
  	    return (a & b) ^ (a & c) ^ (b & c);
  	}
  	/**
  	 * Merkle-Damgard hash construction base class.
  	 * Could be used to create MD5, RIPEMD, SHA1, SHA2.
  	 */
  	class HashMD extends utils_ts_1.Hash {
  	    constructor(blockLen, outputLen, padOffset, isLE) {
  	        super();
  	        this.finished = false;
  	        this.length = 0;
  	        this.pos = 0;
  	        this.destroyed = false;
  	        this.blockLen = blockLen;
  	        this.outputLen = outputLen;
  	        this.padOffset = padOffset;
  	        this.isLE = isLE;
  	        this.buffer = new Uint8Array(blockLen);
  	        this.view = (0, utils_ts_1.createView)(this.buffer);
  	    }
  	    update(data) {
  	        (0, utils_ts_1.aexists)(this);
  	        data = (0, utils_ts_1.toBytes)(data);
  	        (0, utils_ts_1.abytes)(data);
  	        const { view, buffer, blockLen } = this;
  	        const len = data.length;
  	        for (let pos = 0; pos < len;) {
  	            const take = Math.min(blockLen - this.pos, len - pos);
  	            // Fast path: we have at least one block in input, cast it to view and process
  	            if (take === blockLen) {
  	                const dataView = (0, utils_ts_1.createView)(data);
  	                for (; blockLen <= len - pos; pos += blockLen)
  	                    this.process(dataView, pos);
  	                continue;
  	            }
  	            buffer.set(data.subarray(pos, pos + take), this.pos);
  	            this.pos += take;
  	            pos += take;
  	            if (this.pos === blockLen) {
  	                this.process(view, 0);
  	                this.pos = 0;
  	            }
  	        }
  	        this.length += data.length;
  	        this.roundClean();
  	        return this;
  	    }
  	    digestInto(out) {
  	        (0, utils_ts_1.aexists)(this);
  	        (0, utils_ts_1.aoutput)(out, this);
  	        this.finished = true;
  	        // Padding
  	        // We can avoid allocation of buffer for padding completely if it
  	        // was previously not allocated here. But it won't change performance.
  	        const { buffer, view, blockLen, isLE } = this;
  	        let { pos } = this;
  	        // append the bit '1' to the message
  	        buffer[pos++] = 0b10000000;
  	        (0, utils_ts_1.clean)(this.buffer.subarray(pos));
  	        // we have less than padOffset left in buffer, so we cannot put length in
  	        // current block, need process it and pad again
  	        if (this.padOffset > blockLen - pos) {
  	            this.process(view, 0);
  	            pos = 0;
  	        }
  	        // Pad until full block byte with zeros
  	        for (let i = pos; i < blockLen; i++)
  	            buffer[i] = 0;
  	        // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
  	        // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
  	        // So we just write lowest 64 bits of that value.
  	        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
  	        this.process(view, 0);
  	        const oview = (0, utils_ts_1.createView)(out);
  	        const len = this.outputLen;
  	        // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
  	        if (len % 4)
  	            throw new Error('_sha2: outputLen should be aligned to 32bit');
  	        const outLen = len / 4;
  	        const state = this.get();
  	        if (outLen > state.length)
  	            throw new Error('_sha2: outputLen bigger than state');
  	        for (let i = 0; i < outLen; i++)
  	            oview.setUint32(4 * i, state[i], isLE);
  	    }
  	    digest() {
  	        const { buffer, outputLen } = this;
  	        this.digestInto(buffer);
  	        const res = buffer.slice(0, outputLen);
  	        this.destroy();
  	        return res;
  	    }
  	    _cloneInto(to) {
  	        to || (to = new this.constructor());
  	        to.set(...this.get());
  	        const { blockLen, buffer, length, finished, destroyed, pos } = this;
  	        to.destroyed = destroyed;
  	        to.finished = finished;
  	        to.length = length;
  	        to.pos = pos;
  	        if (length % blockLen)
  	            to.buffer.set(buffer);
  	        return to;
  	    }
  	    clone() {
  	        return this._cloneInto();
  	    }
  	}
  	_md.HashMD = HashMD;
  	/**
  	 * Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
  	 * Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
  	 */
  	/** Initial SHA256 state. Bits 0..32 of frac part of sqrt of primes 2..19 */
  	_md.SHA256_IV = Uint32Array.from([
  	    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  	]);
  	/** Initial SHA224 state. Bits 32..64 of frac part of sqrt of primes 23..53 */
  	_md.SHA224_IV = Uint32Array.from([
  	    0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4,
  	]);
  	/** Initial SHA384 state. Bits 0..64 of frac part of sqrt of primes 23..53 */
  	_md.SHA384_IV = Uint32Array.from([
  	    0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939,
  	    0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4,
  	]);
  	/** Initial SHA512 state. Bits 0..64 of frac part of sqrt of primes 2..19 */
  	_md.SHA512_IV = Uint32Array.from([
  	    0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1,
  	    0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179,
  	]);
  	
  	return _md;
  }

  var _u64 = {};

  var hasRequired_u64;

  function require_u64 () {
  	if (hasRequired_u64) return _u64;
  	hasRequired_u64 = 1;
  	Object.defineProperty(_u64, "__esModule", { value: true });
  	_u64.toBig = _u64.shrSL = _u64.shrSH = _u64.rotrSL = _u64.rotrSH = _u64.rotrBL = _u64.rotrBH = _u64.rotr32L = _u64.rotr32H = _u64.rotlSL = _u64.rotlSH = _u64.rotlBL = _u64.rotlBH = _u64.add5L = _u64.add5H = _u64.add4L = _u64.add4H = _u64.add3L = _u64.add3H = void 0;
  	_u64.add = add;
  	_u64.fromBig = fromBig;
  	_u64.split = split;
  	/**
  	 * Internal helpers for u64. BigUint64Array is too slow as per 2025, so we implement it using Uint32Array.
  	 * @todo re-check https://issues.chromium.org/issues/42212588
  	 * @module
  	 */
  	const U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
  	const _32n = /* @__PURE__ */ BigInt(32);
  	function fromBig(n, le = false) {
  	    if (le)
  	        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
  	    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
  	}
  	function split(lst, le = false) {
  	    const len = lst.length;
  	    let Ah = new Uint32Array(len);
  	    let Al = new Uint32Array(len);
  	    for (let i = 0; i < len; i++) {
  	        const { h, l } = fromBig(lst[i], le);
  	        [Ah[i], Al[i]] = [h, l];
  	    }
  	    return [Ah, Al];
  	}
  	const toBig = (h, l) => (BigInt(h >>> 0) << _32n) | BigInt(l >>> 0);
  	_u64.toBig = toBig;
  	// for Shift in [0, 32)
  	const shrSH = (h, _l, s) => h >>> s;
  	_u64.shrSH = shrSH;
  	const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
  	_u64.shrSL = shrSL;
  	// Right rotate for Shift in [1, 32)
  	const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
  	_u64.rotrSH = rotrSH;
  	const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
  	_u64.rotrSL = rotrSL;
  	// Right rotate for Shift in (32, 64), NOTE: 32 is special case.
  	const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
  	_u64.rotrBH = rotrBH;
  	const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
  	_u64.rotrBL = rotrBL;
  	// Right rotate for shift===32 (just swaps l&h)
  	const rotr32H = (_h, l) => l;
  	_u64.rotr32H = rotr32H;
  	const rotr32L = (h, _l) => h;
  	_u64.rotr32L = rotr32L;
  	// Left rotate for Shift in [1, 32)
  	const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
  	_u64.rotlSH = rotlSH;
  	const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
  	_u64.rotlSL = rotlSL;
  	// Left rotate for Shift in (32, 64), NOTE: 32 is special case.
  	const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
  	_u64.rotlBH = rotlBH;
  	const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
  	_u64.rotlBL = rotlBL;
  	// JS uses 32-bit signed integers for bitwise operations which means we cannot
  	// simple take carry out of low bit sum by shift, we need to use division.
  	function add(Ah, Al, Bh, Bl) {
  	    const l = (Al >>> 0) + (Bl >>> 0);
  	    return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
  	}
  	// Addition with more than 2 elements
  	const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
  	_u64.add3L = add3L;
  	const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
  	_u64.add3H = add3H;
  	const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
  	_u64.add4L = add4L;
  	const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
  	_u64.add4H = add4H;
  	const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
  	_u64.add5L = add5L;
  	const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;
  	_u64.add5H = add5H;
  	// prettier-ignore
  	const u64 = {
  	    fromBig, split, toBig,
  	    shrSH, shrSL,
  	    rotrSH, rotrSL, rotrBH, rotrBL,
  	    rotr32H, rotr32L,
  	    rotlSH, rotlSL, rotlBH, rotlBL,
  	    add, add3L, add3H, add4L, add4H, add5H, add5L,
  	};
  	_u64.default = u64;
  	
  	return _u64;
  }

  var hasRequiredSha2;

  function requireSha2 () {
  	if (hasRequiredSha2) return sha2;
  	hasRequiredSha2 = 1;
  	Object.defineProperty(sha2, "__esModule", { value: true });
  	sha2.sha512_224 = sha2.sha512_256 = sha2.sha384 = sha2.sha512 = sha2.sha224 = sha2.sha256 = sha2.SHA512_256 = sha2.SHA512_224 = sha2.SHA384 = sha2.SHA512 = sha2.SHA224 = sha2.SHA256 = void 0;
  	/**
  	 * SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
  	 * SHA256 is the fastest hash implementable in JS, even faster than Blake3.
  	 * Check out [RFC 4634](https://datatracker.ietf.org/doc/html/rfc4634) and
  	 * [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
  	 * @module
  	 */
  	const _md_ts_1 = /*@__PURE__*/ require_md();
  	const u64 = /*@__PURE__*/ require_u64();
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$2();
  	/**
  	 * Round constants:
  	 * First 32 bits of fractional parts of the cube roots of the first 64 primes 2..311)
  	 */
  	// prettier-ignore
  	const SHA256_K = /* @__PURE__ */ Uint32Array.from([
  	    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  	    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  	    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  	    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  	    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  	    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  	    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  	    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  	]);
  	/** Reusable temporary buffer. "W" comes straight from spec. */
  	const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
  	class SHA256 extends _md_ts_1.HashMD {
  	    constructor(outputLen = 32) {
  	        super(64, outputLen, 8, false);
  	        // We cannot use array here since array allows indexing by variable
  	        // which means optimizer/compiler cannot use registers.
  	        this.A = _md_ts_1.SHA256_IV[0] | 0;
  	        this.B = _md_ts_1.SHA256_IV[1] | 0;
  	        this.C = _md_ts_1.SHA256_IV[2] | 0;
  	        this.D = _md_ts_1.SHA256_IV[3] | 0;
  	        this.E = _md_ts_1.SHA256_IV[4] | 0;
  	        this.F = _md_ts_1.SHA256_IV[5] | 0;
  	        this.G = _md_ts_1.SHA256_IV[6] | 0;
  	        this.H = _md_ts_1.SHA256_IV[7] | 0;
  	    }
  	    get() {
  	        const { A, B, C, D, E, F, G, H } = this;
  	        return [A, B, C, D, E, F, G, H];
  	    }
  	    // prettier-ignore
  	    set(A, B, C, D, E, F, G, H) {
  	        this.A = A | 0;
  	        this.B = B | 0;
  	        this.C = C | 0;
  	        this.D = D | 0;
  	        this.E = E | 0;
  	        this.F = F | 0;
  	        this.G = G | 0;
  	        this.H = H | 0;
  	    }
  	    process(view, offset) {
  	        // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
  	        for (let i = 0; i < 16; i++, offset += 4)
  	            SHA256_W[i] = view.getUint32(offset, false);
  	        for (let i = 16; i < 64; i++) {
  	            const W15 = SHA256_W[i - 15];
  	            const W2 = SHA256_W[i - 2];
  	            const s0 = (0, utils_ts_1.rotr)(W15, 7) ^ (0, utils_ts_1.rotr)(W15, 18) ^ (W15 >>> 3);
  	            const s1 = (0, utils_ts_1.rotr)(W2, 17) ^ (0, utils_ts_1.rotr)(W2, 19) ^ (W2 >>> 10);
  	            SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
  	        }
  	        // Compression function main loop, 64 rounds
  	        let { A, B, C, D, E, F, G, H } = this;
  	        for (let i = 0; i < 64; i++) {
  	            const sigma1 = (0, utils_ts_1.rotr)(E, 6) ^ (0, utils_ts_1.rotr)(E, 11) ^ (0, utils_ts_1.rotr)(E, 25);
  	            const T1 = (H + sigma1 + (0, _md_ts_1.Chi)(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
  	            const sigma0 = (0, utils_ts_1.rotr)(A, 2) ^ (0, utils_ts_1.rotr)(A, 13) ^ (0, utils_ts_1.rotr)(A, 22);
  	            const T2 = (sigma0 + (0, _md_ts_1.Maj)(A, B, C)) | 0;
  	            H = G;
  	            G = F;
  	            F = E;
  	            E = (D + T1) | 0;
  	            D = C;
  	            C = B;
  	            B = A;
  	            A = (T1 + T2) | 0;
  	        }
  	        // Add the compressed chunk to the current hash value
  	        A = (A + this.A) | 0;
  	        B = (B + this.B) | 0;
  	        C = (C + this.C) | 0;
  	        D = (D + this.D) | 0;
  	        E = (E + this.E) | 0;
  	        F = (F + this.F) | 0;
  	        G = (G + this.G) | 0;
  	        H = (H + this.H) | 0;
  	        this.set(A, B, C, D, E, F, G, H);
  	    }
  	    roundClean() {
  	        (0, utils_ts_1.clean)(SHA256_W);
  	    }
  	    destroy() {
  	        this.set(0, 0, 0, 0, 0, 0, 0, 0);
  	        (0, utils_ts_1.clean)(this.buffer);
  	    }
  	}
  	sha2.SHA256 = SHA256;
  	class SHA224 extends SHA256 {
  	    constructor() {
  	        super(28);
  	        this.A = _md_ts_1.SHA224_IV[0] | 0;
  	        this.B = _md_ts_1.SHA224_IV[1] | 0;
  	        this.C = _md_ts_1.SHA224_IV[2] | 0;
  	        this.D = _md_ts_1.SHA224_IV[3] | 0;
  	        this.E = _md_ts_1.SHA224_IV[4] | 0;
  	        this.F = _md_ts_1.SHA224_IV[5] | 0;
  	        this.G = _md_ts_1.SHA224_IV[6] | 0;
  	        this.H = _md_ts_1.SHA224_IV[7] | 0;
  	    }
  	}
  	sha2.SHA224 = SHA224;
  	// SHA2-512 is slower than sha256 in js because u64 operations are slow.
  	// Round contants
  	// First 32 bits of the fractional parts of the cube roots of the first 80 primes 2..409
  	// prettier-ignore
  	const K512 = /* @__PURE__ */ (() => u64.split([
  	    '0x428a2f98d728ae22', '0x7137449123ef65cd', '0xb5c0fbcfec4d3b2f', '0xe9b5dba58189dbbc',
  	    '0x3956c25bf348b538', '0x59f111f1b605d019', '0x923f82a4af194f9b', '0xab1c5ed5da6d8118',
  	    '0xd807aa98a3030242', '0x12835b0145706fbe', '0x243185be4ee4b28c', '0x550c7dc3d5ffb4e2',
  	    '0x72be5d74f27b896f', '0x80deb1fe3b1696b1', '0x9bdc06a725c71235', '0xc19bf174cf692694',
  	    '0xe49b69c19ef14ad2', '0xefbe4786384f25e3', '0x0fc19dc68b8cd5b5', '0x240ca1cc77ac9c65',
  	    '0x2de92c6f592b0275', '0x4a7484aa6ea6e483', '0x5cb0a9dcbd41fbd4', '0x76f988da831153b5',
  	    '0x983e5152ee66dfab', '0xa831c66d2db43210', '0xb00327c898fb213f', '0xbf597fc7beef0ee4',
  	    '0xc6e00bf33da88fc2', '0xd5a79147930aa725', '0x06ca6351e003826f', '0x142929670a0e6e70',
  	    '0x27b70a8546d22ffc', '0x2e1b21385c26c926', '0x4d2c6dfc5ac42aed', '0x53380d139d95b3df',
  	    '0x650a73548baf63de', '0x766a0abb3c77b2a8', '0x81c2c92e47edaee6', '0x92722c851482353b',
  	    '0xa2bfe8a14cf10364', '0xa81a664bbc423001', '0xc24b8b70d0f89791', '0xc76c51a30654be30',
  	    '0xd192e819d6ef5218', '0xd69906245565a910', '0xf40e35855771202a', '0x106aa07032bbd1b8',
  	    '0x19a4c116b8d2d0c8', '0x1e376c085141ab53', '0x2748774cdf8eeb99', '0x34b0bcb5e19b48a8',
  	    '0x391c0cb3c5c95a63', '0x4ed8aa4ae3418acb', '0x5b9cca4f7763e373', '0x682e6ff3d6b2b8a3',
  	    '0x748f82ee5defb2fc', '0x78a5636f43172f60', '0x84c87814a1f0ab72', '0x8cc702081a6439ec',
  	    '0x90befffa23631e28', '0xa4506cebde82bde9', '0xbef9a3f7b2c67915', '0xc67178f2e372532b',
  	    '0xca273eceea26619c', '0xd186b8c721c0c207', '0xeada7dd6cde0eb1e', '0xf57d4f7fee6ed178',
  	    '0x06f067aa72176fba', '0x0a637dc5a2c898a6', '0x113f9804bef90dae', '0x1b710b35131c471b',
  	    '0x28db77f523047d84', '0x32caab7b40c72493', '0x3c9ebe0a15c9bebc', '0x431d67c49c100d4c',
  	    '0x4cc5d4becb3e42b6', '0x597f299cfc657e2a', '0x5fcb6fab3ad6faec', '0x6c44198c4a475817'
  	].map(n => BigInt(n))))();
  	const SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
  	const SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
  	// Reusable temporary buffers
  	const SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
  	const SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
  	class SHA512 extends _md_ts_1.HashMD {
  	    constructor(outputLen = 64) {
  	        super(128, outputLen, 16, false);
  	        // We cannot use array here since array allows indexing by variable
  	        // which means optimizer/compiler cannot use registers.
  	        // h -- high 32 bits, l -- low 32 bits
  	        this.Ah = _md_ts_1.SHA512_IV[0] | 0;
  	        this.Al = _md_ts_1.SHA512_IV[1] | 0;
  	        this.Bh = _md_ts_1.SHA512_IV[2] | 0;
  	        this.Bl = _md_ts_1.SHA512_IV[3] | 0;
  	        this.Ch = _md_ts_1.SHA512_IV[4] | 0;
  	        this.Cl = _md_ts_1.SHA512_IV[5] | 0;
  	        this.Dh = _md_ts_1.SHA512_IV[6] | 0;
  	        this.Dl = _md_ts_1.SHA512_IV[7] | 0;
  	        this.Eh = _md_ts_1.SHA512_IV[8] | 0;
  	        this.El = _md_ts_1.SHA512_IV[9] | 0;
  	        this.Fh = _md_ts_1.SHA512_IV[10] | 0;
  	        this.Fl = _md_ts_1.SHA512_IV[11] | 0;
  	        this.Gh = _md_ts_1.SHA512_IV[12] | 0;
  	        this.Gl = _md_ts_1.SHA512_IV[13] | 0;
  	        this.Hh = _md_ts_1.SHA512_IV[14] | 0;
  	        this.Hl = _md_ts_1.SHA512_IV[15] | 0;
  	    }
  	    // prettier-ignore
  	    get() {
  	        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
  	        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
  	    }
  	    // prettier-ignore
  	    set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
  	        this.Ah = Ah | 0;
  	        this.Al = Al | 0;
  	        this.Bh = Bh | 0;
  	        this.Bl = Bl | 0;
  	        this.Ch = Ch | 0;
  	        this.Cl = Cl | 0;
  	        this.Dh = Dh | 0;
  	        this.Dl = Dl | 0;
  	        this.Eh = Eh | 0;
  	        this.El = El | 0;
  	        this.Fh = Fh | 0;
  	        this.Fl = Fl | 0;
  	        this.Gh = Gh | 0;
  	        this.Gl = Gl | 0;
  	        this.Hh = Hh | 0;
  	        this.Hl = Hl | 0;
  	    }
  	    process(view, offset) {
  	        // Extend the first 16 words into the remaining 64 words w[16..79] of the message schedule array
  	        for (let i = 0; i < 16; i++, offset += 4) {
  	            SHA512_W_H[i] = view.getUint32(offset);
  	            SHA512_W_L[i] = view.getUint32((offset += 4));
  	        }
  	        for (let i = 16; i < 80; i++) {
  	            // s0 := (w[i-15] rightrotate 1) xor (w[i-15] rightrotate 8) xor (w[i-15] rightshift 7)
  	            const W15h = SHA512_W_H[i - 15] | 0;
  	            const W15l = SHA512_W_L[i - 15] | 0;
  	            const s0h = u64.rotrSH(W15h, W15l, 1) ^ u64.rotrSH(W15h, W15l, 8) ^ u64.shrSH(W15h, W15l, 7);
  	            const s0l = u64.rotrSL(W15h, W15l, 1) ^ u64.rotrSL(W15h, W15l, 8) ^ u64.shrSL(W15h, W15l, 7);
  	            // s1 := (w[i-2] rightrotate 19) xor (w[i-2] rightrotate 61) xor (w[i-2] rightshift 6)
  	            const W2h = SHA512_W_H[i - 2] | 0;
  	            const W2l = SHA512_W_L[i - 2] | 0;
  	            const s1h = u64.rotrSH(W2h, W2l, 19) ^ u64.rotrBH(W2h, W2l, 61) ^ u64.shrSH(W2h, W2l, 6);
  	            const s1l = u64.rotrSL(W2h, W2l, 19) ^ u64.rotrBL(W2h, W2l, 61) ^ u64.shrSL(W2h, W2l, 6);
  	            // SHA256_W[i] = s0 + s1 + SHA256_W[i - 7] + SHA256_W[i - 16];
  	            const SUMl = u64.add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
  	            const SUMh = u64.add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
  	            SHA512_W_H[i] = SUMh | 0;
  	            SHA512_W_L[i] = SUMl | 0;
  	        }
  	        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
  	        // Compression function main loop, 80 rounds
  	        for (let i = 0; i < 80; i++) {
  	            // S1 := (e rightrotate 14) xor (e rightrotate 18) xor (e rightrotate 41)
  	            const sigma1h = u64.rotrSH(Eh, El, 14) ^ u64.rotrSH(Eh, El, 18) ^ u64.rotrBH(Eh, El, 41);
  	            const sigma1l = u64.rotrSL(Eh, El, 14) ^ u64.rotrSL(Eh, El, 18) ^ u64.rotrBL(Eh, El, 41);
  	            //const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
  	            const CHIh = (Eh & Fh) ^ (~Eh & Gh);
  	            const CHIl = (El & Fl) ^ (~El & Gl);
  	            // T1 = H + sigma1 + Chi(E, F, G) + SHA512_K[i] + SHA512_W[i]
  	            // prettier-ignore
  	            const T1ll = u64.add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
  	            const T1h = u64.add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
  	            const T1l = T1ll | 0;
  	            // S0 := (a rightrotate 28) xor (a rightrotate 34) xor (a rightrotate 39)
  	            const sigma0h = u64.rotrSH(Ah, Al, 28) ^ u64.rotrBH(Ah, Al, 34) ^ u64.rotrBH(Ah, Al, 39);
  	            const sigma0l = u64.rotrSL(Ah, Al, 28) ^ u64.rotrBL(Ah, Al, 34) ^ u64.rotrBL(Ah, Al, 39);
  	            const MAJh = (Ah & Bh) ^ (Ah & Ch) ^ (Bh & Ch);
  	            const MAJl = (Al & Bl) ^ (Al & Cl) ^ (Bl & Cl);
  	            Hh = Gh | 0;
  	            Hl = Gl | 0;
  	            Gh = Fh | 0;
  	            Gl = Fl | 0;
  	            Fh = Eh | 0;
  	            Fl = El | 0;
  	            ({ h: Eh, l: El } = u64.add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
  	            Dh = Ch | 0;
  	            Dl = Cl | 0;
  	            Ch = Bh | 0;
  	            Cl = Bl | 0;
  	            Bh = Ah | 0;
  	            Bl = Al | 0;
  	            const All = u64.add3L(T1l, sigma0l, MAJl);
  	            Ah = u64.add3H(All, T1h, sigma0h, MAJh);
  	            Al = All | 0;
  	        }
  	        // Add the compressed chunk to the current hash value
  	        ({ h: Ah, l: Al } = u64.add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
  	        ({ h: Bh, l: Bl } = u64.add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
  	        ({ h: Ch, l: Cl } = u64.add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
  	        ({ h: Dh, l: Dl } = u64.add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
  	        ({ h: Eh, l: El } = u64.add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
  	        ({ h: Fh, l: Fl } = u64.add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
  	        ({ h: Gh, l: Gl } = u64.add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
  	        ({ h: Hh, l: Hl } = u64.add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
  	        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
  	    }
  	    roundClean() {
  	        (0, utils_ts_1.clean)(SHA512_W_H, SHA512_W_L);
  	    }
  	    destroy() {
  	        (0, utils_ts_1.clean)(this.buffer);
  	        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  	    }
  	}
  	sha2.SHA512 = SHA512;
  	class SHA384 extends SHA512 {
  	    constructor() {
  	        super(48);
  	        this.Ah = _md_ts_1.SHA384_IV[0] | 0;
  	        this.Al = _md_ts_1.SHA384_IV[1] | 0;
  	        this.Bh = _md_ts_1.SHA384_IV[2] | 0;
  	        this.Bl = _md_ts_1.SHA384_IV[3] | 0;
  	        this.Ch = _md_ts_1.SHA384_IV[4] | 0;
  	        this.Cl = _md_ts_1.SHA384_IV[5] | 0;
  	        this.Dh = _md_ts_1.SHA384_IV[6] | 0;
  	        this.Dl = _md_ts_1.SHA384_IV[7] | 0;
  	        this.Eh = _md_ts_1.SHA384_IV[8] | 0;
  	        this.El = _md_ts_1.SHA384_IV[9] | 0;
  	        this.Fh = _md_ts_1.SHA384_IV[10] | 0;
  	        this.Fl = _md_ts_1.SHA384_IV[11] | 0;
  	        this.Gh = _md_ts_1.SHA384_IV[12] | 0;
  	        this.Gl = _md_ts_1.SHA384_IV[13] | 0;
  	        this.Hh = _md_ts_1.SHA384_IV[14] | 0;
  	        this.Hl = _md_ts_1.SHA384_IV[15] | 0;
  	    }
  	}
  	sha2.SHA384 = SHA384;
  	/**
  	 * Truncated SHA512/256 and SHA512/224.
  	 * SHA512_IV is XORed with 0xa5a5a5a5a5a5a5a5, then used as "intermediary" IV of SHA512/t.
  	 * Then t hashes string to produce result IV.
  	 * See `test/misc/sha2-gen-iv.js`.
  	 */
  	/** SHA512/224 IV */
  	const T224_IV = /* @__PURE__ */ Uint32Array.from([
  	    0x8c3d37c8, 0x19544da2, 0x73e19966, 0x89dcd4d6, 0x1dfab7ae, 0x32ff9c82, 0x679dd514, 0x582f9fcf,
  	    0x0f6d2b69, 0x7bd44da8, 0x77e36f73, 0x04c48942, 0x3f9d85a8, 0x6a1d36c8, 0x1112e6ad, 0x91d692a1,
  	]);
  	/** SHA512/256 IV */
  	const T256_IV = /* @__PURE__ */ Uint32Array.from([
  	    0x22312194, 0xfc2bf72c, 0x9f555fa3, 0xc84c64c2, 0x2393b86b, 0x6f53b151, 0x96387719, 0x5940eabd,
  	    0x96283ee2, 0xa88effe3, 0xbe5e1e25, 0x53863992, 0x2b0199fc, 0x2c85b8aa, 0x0eb72ddc, 0x81c52ca2,
  	]);
  	class SHA512_224 extends SHA512 {
  	    constructor() {
  	        super(28);
  	        this.Ah = T224_IV[0] | 0;
  	        this.Al = T224_IV[1] | 0;
  	        this.Bh = T224_IV[2] | 0;
  	        this.Bl = T224_IV[3] | 0;
  	        this.Ch = T224_IV[4] | 0;
  	        this.Cl = T224_IV[5] | 0;
  	        this.Dh = T224_IV[6] | 0;
  	        this.Dl = T224_IV[7] | 0;
  	        this.Eh = T224_IV[8] | 0;
  	        this.El = T224_IV[9] | 0;
  	        this.Fh = T224_IV[10] | 0;
  	        this.Fl = T224_IV[11] | 0;
  	        this.Gh = T224_IV[12] | 0;
  	        this.Gl = T224_IV[13] | 0;
  	        this.Hh = T224_IV[14] | 0;
  	        this.Hl = T224_IV[15] | 0;
  	    }
  	}
  	sha2.SHA512_224 = SHA512_224;
  	class SHA512_256 extends SHA512 {
  	    constructor() {
  	        super(32);
  	        this.Ah = T256_IV[0] | 0;
  	        this.Al = T256_IV[1] | 0;
  	        this.Bh = T256_IV[2] | 0;
  	        this.Bl = T256_IV[3] | 0;
  	        this.Ch = T256_IV[4] | 0;
  	        this.Cl = T256_IV[5] | 0;
  	        this.Dh = T256_IV[6] | 0;
  	        this.Dl = T256_IV[7] | 0;
  	        this.Eh = T256_IV[8] | 0;
  	        this.El = T256_IV[9] | 0;
  	        this.Fh = T256_IV[10] | 0;
  	        this.Fl = T256_IV[11] | 0;
  	        this.Gh = T256_IV[12] | 0;
  	        this.Gl = T256_IV[13] | 0;
  	        this.Hh = T256_IV[14] | 0;
  	        this.Hl = T256_IV[15] | 0;
  	    }
  	}
  	sha2.SHA512_256 = SHA512_256;
  	/**
  	 * SHA2-256 hash function from RFC 4634.
  	 *
  	 * It is the fastest JS hash, even faster than Blake3.
  	 * To break sha256 using birthday attack, attackers need to try 2^128 hashes.
  	 * BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
  	 */
  	sha2.sha256 = (0, utils_ts_1.createHasher)(() => new SHA256());
  	/** SHA2-224 hash function from RFC 4634 */
  	sha2.sha224 = (0, utils_ts_1.createHasher)(() => new SHA224());
  	/** SHA2-512 hash function from RFC 4634. */
  	sha2.sha512 = (0, utils_ts_1.createHasher)(() => new SHA512());
  	/** SHA2-384 hash function from RFC 4634. */
  	sha2.sha384 = (0, utils_ts_1.createHasher)(() => new SHA384());
  	/**
  	 * SHA2-512/256 "truncated" hash function, with improved resistance to length extension attacks.
  	 * See the paper on [truncated SHA512](https://eprint.iacr.org/2010/548.pdf).
  	 */
  	sha2.sha512_256 = (0, utils_ts_1.createHasher)(() => new SHA512_256());
  	/**
  	 * SHA2-512/224 "truncated" hash function, with improved resistance to length extension attacks.
  	 * See the paper on [truncated SHA512](https://eprint.iacr.org/2010/548.pdf).
  	 */
  	sha2.sha512_224 = (0, utils_ts_1.createHasher)(() => new SHA512_224());
  	
  	return sha2;
  }

  var curve = {};

  var utils = {};

  var hasRequiredUtils$1;

  function requireUtils$1 () {
  	if (hasRequiredUtils$1) return utils;
  	hasRequiredUtils$1 = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.notImplemented = exports.bitMask = exports.utf8ToBytes = exports.randomBytes = exports.isBytes = exports.hexToBytes = exports.concatBytes = exports.bytesToUtf8 = exports.bytesToHex = exports.anumber = exports.abytes = void 0;
  		exports.abool = abool;
  		exports.numberToHexUnpadded = numberToHexUnpadded;
  		exports.hexToNumber = hexToNumber;
  		exports.bytesToNumberBE = bytesToNumberBE;
  		exports.bytesToNumberLE = bytesToNumberLE;
  		exports.numberToBytesBE = numberToBytesBE;
  		exports.numberToBytesLE = numberToBytesLE;
  		exports.numberToVarBytesBE = numberToVarBytesBE;
  		exports.ensureBytes = ensureBytes;
  		exports.equalBytes = equalBytes;
  		exports.inRange = inRange;
  		exports.aInRange = aInRange;
  		exports.bitLen = bitLen;
  		exports.bitGet = bitGet;
  		exports.bitSet = bitSet;
  		exports.createHmacDrbg = createHmacDrbg;
  		exports.validateObject = validateObject;
  		exports.isHash = isHash;
  		exports._validateObject = _validateObject;
  		exports.memoized = memoized;
  		/**
  		 * Hex, bytes and number utilities.
  		 * @module
  		 */
  		/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  		const utils_js_1 = /*@__PURE__*/ requireUtils$2();
  		var utils_js_2 = /*@__PURE__*/ requireUtils$2();
  		Object.defineProperty(exports, "abytes", { enumerable: true, get: function () { return utils_js_2.abytes; } });
  		Object.defineProperty(exports, "anumber", { enumerable: true, get: function () { return utils_js_2.anumber; } });
  		Object.defineProperty(exports, "bytesToHex", { enumerable: true, get: function () { return utils_js_2.bytesToHex; } });
  		Object.defineProperty(exports, "bytesToUtf8", { enumerable: true, get: function () { return utils_js_2.bytesToUtf8; } });
  		Object.defineProperty(exports, "concatBytes", { enumerable: true, get: function () { return utils_js_2.concatBytes; } });
  		Object.defineProperty(exports, "hexToBytes", { enumerable: true, get: function () { return utils_js_2.hexToBytes; } });
  		Object.defineProperty(exports, "isBytes", { enumerable: true, get: function () { return utils_js_2.isBytes; } });
  		Object.defineProperty(exports, "randomBytes", { enumerable: true, get: function () { return utils_js_2.randomBytes; } });
  		Object.defineProperty(exports, "utf8ToBytes", { enumerable: true, get: function () { return utils_js_2.utf8ToBytes; } });
  		const _0n = /* @__PURE__ */ BigInt(0);
  		const _1n = /* @__PURE__ */ BigInt(1);
  		function abool(title, value) {
  		    if (typeof value !== 'boolean')
  		        throw new Error(title + ' boolean expected, got ' + value);
  		}
  		// Used in weierstrass, der
  		function numberToHexUnpadded(num) {
  		    const hex = num.toString(16);
  		    return hex.length & 1 ? '0' + hex : hex;
  		}
  		function hexToNumber(hex) {
  		    if (typeof hex !== 'string')
  		        throw new Error('hex string expected, got ' + typeof hex);
  		    return hex === '' ? _0n : BigInt('0x' + hex); // Big Endian
  		}
  		// BE: Big Endian, LE: Little Endian
  		function bytesToNumberBE(bytes) {
  		    return hexToNumber((0, utils_js_1.bytesToHex)(bytes));
  		}
  		function bytesToNumberLE(bytes) {
  		    (0, utils_js_1.abytes)(bytes);
  		    return hexToNumber((0, utils_js_1.bytesToHex)(Uint8Array.from(bytes).reverse()));
  		}
  		function numberToBytesBE(n, len) {
  		    return (0, utils_js_1.hexToBytes)(n.toString(16).padStart(len * 2, '0'));
  		}
  		function numberToBytesLE(n, len) {
  		    return numberToBytesBE(n, len).reverse();
  		}
  		// Unpadded, rarely used
  		function numberToVarBytesBE(n) {
  		    return (0, utils_js_1.hexToBytes)(numberToHexUnpadded(n));
  		}
  		/**
  		 * Takes hex string or Uint8Array, converts to Uint8Array.
  		 * Validates output length.
  		 * Will throw error for other types.
  		 * @param title descriptive title for an error e.g. 'secret key'
  		 * @param hex hex string or Uint8Array
  		 * @param expectedLength optional, will compare to result array's length
  		 * @returns
  		 */
  		function ensureBytes(title, hex, expectedLength) {
  		    let res;
  		    if (typeof hex === 'string') {
  		        try {
  		            res = (0, utils_js_1.hexToBytes)(hex);
  		        }
  		        catch (e) {
  		            throw new Error(title + ' must be hex string or Uint8Array, cause: ' + e);
  		        }
  		    }
  		    else if ((0, utils_js_1.isBytes)(hex)) {
  		        // Uint8Array.from() instead of hash.slice() because node.js Buffer
  		        // is instance of Uint8Array, and its slice() creates **mutable** copy
  		        res = Uint8Array.from(hex);
  		    }
  		    else {
  		        throw new Error(title + ' must be hex string or Uint8Array');
  		    }
  		    const len = res.length;
  		    if (typeof expectedLength === 'number' && len !== expectedLength)
  		        throw new Error(title + ' of length ' + expectedLength + ' expected, got ' + len);
  		    return res;
  		}
  		// Compares 2 u8a-s in kinda constant time
  		function equalBytes(a, b) {
  		    if (a.length !== b.length)
  		        return false;
  		    let diff = 0;
  		    for (let i = 0; i < a.length; i++)
  		        diff |= a[i] ^ b[i];
  		    return diff === 0;
  		}
  		/**
  		 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
  		 */
  		// export const utf8ToBytes: typeof utf8ToBytes_ = utf8ToBytes_;
  		/**
  		 * Converts bytes to string using UTF8 encoding.
  		 * @example bytesToUtf8(Uint8Array.from([97, 98, 99])) // 'abc'
  		 */
  		// export const bytesToUtf8: typeof bytesToUtf8_ = bytesToUtf8_;
  		// Is positive bigint
  		const isPosBig = (n) => typeof n === 'bigint' && _0n <= n;
  		function inRange(n, min, max) {
  		    return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
  		}
  		/**
  		 * Asserts min <= n < max. NOTE: It's < max and not <= max.
  		 * @example
  		 * aInRange('x', x, 1n, 256n); // would assume x is in (1n..255n)
  		 */
  		function aInRange(title, n, min, max) {
  		    // Why min <= n < max and not a (min < n < max) OR b (min <= n <= max)?
  		    // consider P=256n, min=0n, max=P
  		    // - a for min=0 would require -1:          `inRange('x', x, -1n, P)`
  		    // - b would commonly require subtraction:  `inRange('x', x, 0n, P - 1n)`
  		    // - our way is the cleanest:               `inRange('x', x, 0n, P)
  		    if (!inRange(n, min, max))
  		        throw new Error('expected valid ' + title + ': ' + min + ' <= n < ' + max + ', got ' + n);
  		}
  		// Bit operations
  		/**
  		 * Calculates amount of bits in a bigint.
  		 * Same as `n.toString(2).length`
  		 * TODO: merge with nLength in modular
  		 */
  		function bitLen(n) {
  		    let len;
  		    for (len = 0; n > _0n; n >>= _1n, len += 1)
  		        ;
  		    return len;
  		}
  		/**
  		 * Gets single bit at position.
  		 * NOTE: first bit position is 0 (same as arrays)
  		 * Same as `!!+Array.from(n.toString(2)).reverse()[pos]`
  		 */
  		function bitGet(n, pos) {
  		    return (n >> BigInt(pos)) & _1n;
  		}
  		/**
  		 * Sets single bit at position.
  		 */
  		function bitSet(n, pos, value) {
  		    return n | ((value ? _1n : _0n) << BigInt(pos));
  		}
  		/**
  		 * Calculate mask for N bits. Not using ** operator with bigints because of old engines.
  		 * Same as BigInt(`0b${Array(i).fill('1').join('')}`)
  		 */
  		const bitMask = (n) => (_1n << BigInt(n)) - _1n;
  		exports.bitMask = bitMask;
  		/**
  		 * Minimal HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
  		 * @returns function that will call DRBG until 2nd arg returns something meaningful
  		 * @example
  		 *   const drbg = createHmacDRBG<Key>(32, 32, hmac);
  		 *   drbg(seed, bytesToKey); // bytesToKey must return Key or undefined
  		 */
  		function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  		    if (typeof hashLen !== 'number' || hashLen < 2)
  		        throw new Error('hashLen must be a number');
  		    if (typeof qByteLen !== 'number' || qByteLen < 2)
  		        throw new Error('qByteLen must be a number');
  		    if (typeof hmacFn !== 'function')
  		        throw new Error('hmacFn must be a function');
  		    // Step B, Step C: set hashLen to 8*ceil(hlen/8)
  		    const u8n = (len) => new Uint8Array(len); // creates Uint8Array
  		    const u8of = (byte) => Uint8Array.of(byte); // another shortcut
  		    let v = u8n(hashLen); // Minimal non-full-spec HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
  		    let k = u8n(hashLen); // Steps B and C of RFC6979 3.2: set hashLen, in our case always same
  		    let i = 0; // Iterations counter, will throw when over 1000
  		    const reset = () => {
  		        v.fill(1);
  		        k.fill(0);
  		        i = 0;
  		    };
  		    const h = (...b) => hmacFn(k, v, ...b); // hmac(k)(v, ...values)
  		    const reseed = (seed = u8n(0)) => {
  		        // HMAC-DRBG reseed() function. Steps D-G
  		        k = h(u8of(0x00), seed); // k = hmac(k || v || 0x00 || seed)
  		        v = h(); // v = hmac(k || v)
  		        if (seed.length === 0)
  		            return;
  		        k = h(u8of(0x01), seed); // k = hmac(k || v || 0x01 || seed)
  		        v = h(); // v = hmac(k || v)
  		    };
  		    const gen = () => {
  		        // HMAC-DRBG generate() function
  		        if (i++ >= 1000)
  		            throw new Error('drbg: tried 1000 values');
  		        let len = 0;
  		        const out = [];
  		        while (len < qByteLen) {
  		            v = h();
  		            const sl = v.slice();
  		            out.push(sl);
  		            len += v.length;
  		        }
  		        return (0, utils_js_1.concatBytes)(...out);
  		    };
  		    const genUntil = (seed, pred) => {
  		        reset();
  		        reseed(seed); // Steps D-G
  		        let res = undefined; // Step H: grind until k is in [1..n-1]
  		        while (!(res = pred(gen())))
  		            reseed();
  		        reset();
  		        return res;
  		    };
  		    return genUntil;
  		}
  		// Validating curves and fields
  		const validatorFns = {
  		    bigint: (val) => typeof val === 'bigint',
  		    function: (val) => typeof val === 'function',
  		    boolean: (val) => typeof val === 'boolean',
  		    string: (val) => typeof val === 'string',
  		    stringOrUint8Array: (val) => typeof val === 'string' || (0, utils_js_1.isBytes)(val),
  		    isSafeInteger: (val) => Number.isSafeInteger(val),
  		    array: (val) => Array.isArray(val),
  		    field: (val, object) => object.Fp.isValid(val),
  		    hash: (val) => typeof val === 'function' && Number.isSafeInteger(val.outputLen),
  		};
  		// type Record<K extends string | number | symbol, T> = { [P in K]: T; }
  		function validateObject(object, validators, optValidators = {}) {
  		    const checkField = (fieldName, type, isOptional) => {
  		        const checkVal = validatorFns[type];
  		        if (typeof checkVal !== 'function')
  		            throw new Error('invalid validator function');
  		        const val = object[fieldName];
  		        if (isOptional && val === undefined)
  		            return;
  		        if (!checkVal(val, object)) {
  		            throw new Error('param ' + String(fieldName) + ' is invalid. Expected ' + type + ', got ' + val);
  		        }
  		    };
  		    for (const [fieldName, type] of Object.entries(validators))
  		        checkField(fieldName, type, false);
  		    for (const [fieldName, type] of Object.entries(optValidators))
  		        checkField(fieldName, type, true);
  		    return object;
  		}
  		// validate type tests
  		// const o: { a: number; b: number; c: number } = { a: 1, b: 5, c: 6 };
  		// const z0 = validateObject(o, { a: 'isSafeInteger' }, { c: 'bigint' }); // Ok!
  		// // Should fail type-check
  		// const z1 = validateObject(o, { a: 'tmp' }, { c: 'zz' });
  		// const z2 = validateObject(o, { a: 'isSafeInteger' }, { c: 'zz' });
  		// const z3 = validateObject(o, { test: 'boolean', z: 'bug' });
  		// const z4 = validateObject(o, { a: 'boolean', z: 'bug' });
  		function isHash(val) {
  		    return typeof val === 'function' && Number.isSafeInteger(val.outputLen);
  		}
  		function _validateObject(object, fields, optFields = {}) {
  		    if (!object || typeof object !== 'object')
  		        throw new Error('expected valid options object');
  		    function checkField(fieldName, expectedType, isOpt) {
  		        const val = object[fieldName];
  		        if (isOpt && val === undefined)
  		            return;
  		        const current = typeof val;
  		        if (current !== expectedType || val === null)
  		            throw new Error(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
  		    }
  		    Object.entries(fields).forEach(([k, v]) => checkField(k, v, false));
  		    Object.entries(optFields).forEach(([k, v]) => checkField(k, v, true));
  		}
  		/**
  		 * throws not implemented error
  		 */
  		const notImplemented = () => {
  		    throw new Error('not implemented');
  		};
  		exports.notImplemented = notImplemented;
  		/**
  		 * Memoizes (caches) computation result.
  		 * Uses WeakMap: the value is going auto-cleaned by GC after last reference is removed.
  		 */
  		function memoized(fn) {
  		    const map = new WeakMap();
  		    return (arg, ...args) => {
  		        const val = map.get(arg);
  		        if (val !== undefined)
  		            return val;
  		        const computed = fn(arg, ...args);
  		        map.set(arg, computed);
  		        return computed;
  		    };
  		}
  		
  	} (utils));
  	return utils;
  }

  var modular = {};

  var hasRequiredModular;

  function requireModular () {
  	if (hasRequiredModular) return modular;
  	hasRequiredModular = 1;
  	Object.defineProperty(modular, "__esModule", { value: true });
  	modular.isNegativeLE = void 0;
  	modular.mod = mod;
  	modular.pow = pow;
  	modular.pow2 = pow2;
  	modular.invert = invert;
  	modular.tonelliShanks = tonelliShanks;
  	modular.FpSqrt = FpSqrt;
  	modular.validateField = validateField;
  	modular.FpPow = FpPow;
  	modular.FpInvertBatch = FpInvertBatch;
  	modular.FpDiv = FpDiv;
  	modular.FpLegendre = FpLegendre;
  	modular.FpIsSquare = FpIsSquare;
  	modular.nLength = nLength;
  	modular.Field = Field;
  	modular.FpSqrtOdd = FpSqrtOdd;
  	modular.FpSqrtEven = FpSqrtEven;
  	modular.hashToPrivateScalar = hashToPrivateScalar;
  	modular.getFieldBytesLength = getFieldBytesLength;
  	modular.getMinHashLength = getMinHashLength;
  	modular.mapHashToField = mapHashToField;
  	/**
  	 * Utils for modular division and fields.
  	 * Field over 11 is a finite (Galois) field is integer number operations `mod 11`.
  	 * There is no division: it is replaced by modular multiplicative inverse.
  	 * @module
  	 */
  	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$1();
  	// prettier-ignore
  	const _0n = BigInt(0), _1n = BigInt(1), _2n = /* @__PURE__ */ BigInt(2), _3n = /* @__PURE__ */ BigInt(3);
  	// prettier-ignore
  	const _4n = /* @__PURE__ */ BigInt(4), _5n = /* @__PURE__ */ BigInt(5), _7n = /* @__PURE__ */ BigInt(7);
  	// prettier-ignore
  	const _8n = /* @__PURE__ */ BigInt(8), _9n = /* @__PURE__ */ BigInt(9), _16n = /* @__PURE__ */ BigInt(16);
  	// Calculates a modulo b
  	function mod(a, b) {
  	    const result = a % b;
  	    return result >= _0n ? result : b + result;
  	}
  	/**
  	 * Efficiently raise num to power and do modular division.
  	 * Unsafe in some contexts: uses ladder, so can expose bigint bits.
  	 * @example
  	 * pow(2n, 6n, 11n) // 64n % 11n == 9n
  	 */
  	function pow(num, power, modulo) {
  	    return FpPow(Field(modulo), num, power);
  	}
  	/** Does `x^(2^power)` mod p. `pow2(30, 4)` == `30^(2^4)` */
  	function pow2(x, power, modulo) {
  	    let res = x;
  	    while (power-- > _0n) {
  	        res *= res;
  	        res %= modulo;
  	    }
  	    return res;
  	}
  	/**
  	 * Inverses number over modulo.
  	 * Implemented using [Euclidean GCD](https://brilliant.org/wiki/extended-euclidean-algorithm/).
  	 */
  	function invert(number, modulo) {
  	    if (number === _0n)
  	        throw new Error('invert: expected non-zero number');
  	    if (modulo <= _0n)
  	        throw new Error('invert: expected positive modulus, got ' + modulo);
  	    // Fermat's little theorem "CT-like" version inv(n) = n^(m-2) mod m is 30x slower.
  	    let a = mod(number, modulo);
  	    let b = modulo;
  	    // prettier-ignore
  	    let x = _0n, u = _1n;
  	    while (a !== _0n) {
  	        // JIT applies optimization if those two lines follow each other
  	        const q = b / a;
  	        const r = b % a;
  	        const m = x - u * q;
  	        // prettier-ignore
  	        b = a, a = r, x = u, u = m;
  	    }
  	    const gcd = b;
  	    if (gcd !== _1n)
  	        throw new Error('invert: does not exist');
  	    return mod(x, modulo);
  	}
  	function assertIsSquare(Fp, root, n) {
  	    if (!Fp.eql(Fp.sqr(root), n))
  	        throw new Error('Cannot find square root');
  	}
  	// Not all roots are possible! Example which will throw:
  	// const NUM =
  	// n = 72057594037927816n;
  	// Fp = Field(BigInt('0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab'));
  	function sqrt3mod4(Fp, n) {
  	    const p1div4 = (Fp.ORDER + _1n) / _4n;
  	    const root = Fp.pow(n, p1div4);
  	    assertIsSquare(Fp, root, n);
  	    return root;
  	}
  	function sqrt5mod8(Fp, n) {
  	    const p5div8 = (Fp.ORDER - _5n) / _8n;
  	    const n2 = Fp.mul(n, _2n);
  	    const v = Fp.pow(n2, p5div8);
  	    const nv = Fp.mul(n, v);
  	    const i = Fp.mul(Fp.mul(nv, _2n), v);
  	    const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
  	    assertIsSquare(Fp, root, n);
  	    return root;
  	}
  	// Based on RFC9380, Kong algorithm
  	// prettier-ignore
  	function sqrt9mod16(P) {
  	    const Fp_ = Field(P);
  	    const tn = tonelliShanks(P);
  	    const c1 = tn(Fp_, Fp_.neg(Fp_.ONE)); //  1. c1 = sqrt(-1) in F, i.e., (c1^2) == -1 in F
  	    const c2 = tn(Fp_, c1); //  2. c2 = sqrt(c1) in F, i.e., (c2^2) == c1 in F
  	    const c3 = tn(Fp_, Fp_.neg(c1)); //  3. c3 = sqrt(-c1) in F, i.e., (c3^2) == -c1 in F
  	    const c4 = (P + _7n) / _16n; //  4. c4 = (q + 7) / 16        # Integer arithmetic
  	    return (Fp, n) => {
  	        let tv1 = Fp.pow(n, c4); //  1. tv1 = x^c4
  	        let tv2 = Fp.mul(tv1, c1); //  2. tv2 = c1 * tv1
  	        const tv3 = Fp.mul(tv1, c2); //  3. tv3 = c2 * tv1
  	        const tv4 = Fp.mul(tv1, c3); //  4. tv4 = c3 * tv1
  	        const e1 = Fp.eql(Fp.sqr(tv2), n); //  5.  e1 = (tv2^2) == x
  	        const e2 = Fp.eql(Fp.sqr(tv3), n); //  6.  e2 = (tv3^2) == x
  	        tv1 = Fp.cmov(tv1, tv2, e1); //  7. tv1 = CMOV(tv1, tv2, e1)  # Select tv2 if (tv2^2) == x
  	        tv2 = Fp.cmov(tv4, tv3, e2); //  8. tv2 = CMOV(tv4, tv3, e2)  # Select tv3 if (tv3^2) == x
  	        const e3 = Fp.eql(Fp.sqr(tv2), n); //  9.  e3 = (tv2^2) == x
  	        const root = Fp.cmov(tv1, tv2, e3); // 10.  z = CMOV(tv1, tv2, e3)   # Select sqrt from tv1 & tv2
  	        assertIsSquare(Fp, root, n);
  	        return root;
  	    };
  	}
  	/**
  	 * Tonelli-Shanks square root search algorithm.
  	 * 1. https://eprint.iacr.org/2012/685.pdf (page 12)
  	 * 2. Square Roots from 1; 24, 51, 10 to Dan Shanks
  	 * @param P field order
  	 * @returns function that takes field Fp (created from P) and number n
  	 */
  	function tonelliShanks(P) {
  	    // Initialization (precomputation).
  	    // Caching initialization could boost perf by 7%.
  	    if (P < _3n)
  	        throw new Error('sqrt is not defined for small field');
  	    // Factor P - 1 = Q * 2^S, where Q is odd
  	    let Q = P - _1n;
  	    let S = 0;
  	    while (Q % _2n === _0n) {
  	        Q /= _2n;
  	        S++;
  	    }
  	    // Find the first quadratic non-residue Z >= 2
  	    let Z = _2n;
  	    const _Fp = Field(P);
  	    while (FpLegendre(_Fp, Z) === 1) {
  	        // Basic primality test for P. After x iterations, chance of
  	        // not finding quadratic non-residue is 2^x, so 2^1000.
  	        if (Z++ > 1000)
  	            throw new Error('Cannot find square root: probably non-prime P');
  	    }
  	    // Fast-path; usually done before Z, but we do "primality test".
  	    if (S === 1)
  	        return sqrt3mod4;
  	    // Slow-path
  	    // TODO: test on Fp2 and others
  	    let cc = _Fp.pow(Z, Q); // c = z^Q
  	    const Q1div2 = (Q + _1n) / _2n;
  	    return function tonelliSlow(Fp, n) {
  	        if (Fp.is0(n))
  	            return n;
  	        // Check if n is a quadratic residue using Legendre symbol
  	        if (FpLegendre(Fp, n) !== 1)
  	            throw new Error('Cannot find square root');
  	        // Initialize variables for the main loop
  	        let M = S;
  	        let c = Fp.mul(Fp.ONE, cc); // c = z^Q, move cc from field _Fp into field Fp
  	        let t = Fp.pow(n, Q); // t = n^Q, first guess at the fudge factor
  	        let R = Fp.pow(n, Q1div2); // R = n^((Q+1)/2), first guess at the square root
  	        // Main loop
  	        // while t != 1
  	        while (!Fp.eql(t, Fp.ONE)) {
  	            if (Fp.is0(t))
  	                return Fp.ZERO; // if t=0 return R=0
  	            let i = 1;
  	            // Find the smallest i >= 1 such that t^(2^i) ≡ 1 (mod P)
  	            let t_tmp = Fp.sqr(t); // t^(2^1)
  	            while (!Fp.eql(t_tmp, Fp.ONE)) {
  	                i++;
  	                t_tmp = Fp.sqr(t_tmp); // t^(2^2)...
  	                if (i === M)
  	                    throw new Error('Cannot find square root');
  	            }
  	            // Calculate the exponent for b: 2^(M - i - 1)
  	            const exponent = _1n << BigInt(M - i - 1); // bigint is important
  	            const b = Fp.pow(c, exponent); // b = 2^(M - i - 1)
  	            // Update variables
  	            M = i;
  	            c = Fp.sqr(b); // c = b^2
  	            t = Fp.mul(t, c); // t = (t * b^2)
  	            R = Fp.mul(R, b); // R = R*b
  	        }
  	        return R;
  	    };
  	}
  	/**
  	 * Square root for a finite field. Will try optimized versions first:
  	 *
  	 * 1. P ≡ 3 (mod 4)
  	 * 2. P ≡ 5 (mod 8)
  	 * 3. P ≡ 9 (mod 16)
  	 * 4. Tonelli-Shanks algorithm
  	 *
  	 * Different algorithms can give different roots, it is up to user to decide which one they want.
  	 * For example there is FpSqrtOdd/FpSqrtEven to choice root based on oddness (used for hash-to-curve).
  	 */
  	function FpSqrt(P) {
  	    // P ≡ 3 (mod 4) => √n = n^((P+1)/4)
  	    if (P % _4n === _3n)
  	        return sqrt3mod4;
  	    // P ≡ 5 (mod 8) => Atkin algorithm, page 10 of https://eprint.iacr.org/2012/685.pdf
  	    if (P % _8n === _5n)
  	        return sqrt5mod8;
  	    // P ≡ 9 (mod 16) => Kong algorithm, page 11 of https://eprint.iacr.org/2012/685.pdf (algorithm 4)
  	    if (P % _16n === _9n)
  	        return sqrt9mod16(P);
  	    // Tonelli-Shanks algorithm
  	    return tonelliShanks(P);
  	}
  	// Little-endian check for first LE bit (last BE bit);
  	const isNegativeLE = (num, modulo) => (mod(num, modulo) & _1n) === _1n;
  	modular.isNegativeLE = isNegativeLE;
  	// prettier-ignore
  	const FIELD_FIELDS = [
  	    'create', 'isValid', 'is0', 'neg', 'inv', 'sqrt', 'sqr',
  	    'eql', 'add', 'sub', 'mul', 'pow', 'div',
  	    'addN', 'subN', 'mulN', 'sqrN'
  	];
  	function validateField(field) {
  	    const initial = {
  	        ORDER: 'bigint',
  	        MASK: 'bigint',
  	        BYTES: 'number',
  	        BITS: 'number',
  	    };
  	    const opts = FIELD_FIELDS.reduce((map, val) => {
  	        map[val] = 'function';
  	        return map;
  	    }, initial);
  	    (0, utils_ts_1._validateObject)(field, opts);
  	    // const max = 16384;
  	    // if (field.BYTES < 1 || field.BYTES > max) throw new Error('invalid field');
  	    // if (field.BITS < 1 || field.BITS > 8 * max) throw new Error('invalid field');
  	    return field;
  	}
  	// Generic field functions
  	/**
  	 * Same as `pow` but for Fp: non-constant-time.
  	 * Unsafe in some contexts: uses ladder, so can expose bigint bits.
  	 */
  	function FpPow(Fp, num, power) {
  	    if (power < _0n)
  	        throw new Error('invalid exponent, negatives unsupported');
  	    if (power === _0n)
  	        return Fp.ONE;
  	    if (power === _1n)
  	        return num;
  	    let p = Fp.ONE;
  	    let d = num;
  	    while (power > _0n) {
  	        if (power & _1n)
  	            p = Fp.mul(p, d);
  	        d = Fp.sqr(d);
  	        power >>= _1n;
  	    }
  	    return p;
  	}
  	/**
  	 * Efficiently invert an array of Field elements.
  	 * Exception-free. Will return `undefined` for 0 elements.
  	 * @param passZero map 0 to 0 (instead of undefined)
  	 */
  	function FpInvertBatch(Fp, nums, passZero = false) {
  	    const inverted = new Array(nums.length).fill(passZero ? Fp.ZERO : undefined);
  	    // Walk from first to last, multiply them by each other MOD p
  	    const multipliedAcc = nums.reduce((acc, num, i) => {
  	        if (Fp.is0(num))
  	            return acc;
  	        inverted[i] = acc;
  	        return Fp.mul(acc, num);
  	    }, Fp.ONE);
  	    // Invert last element
  	    const invertedAcc = Fp.inv(multipliedAcc);
  	    // Walk from last to first, multiply them by inverted each other MOD p
  	    nums.reduceRight((acc, num, i) => {
  	        if (Fp.is0(num))
  	            return acc;
  	        inverted[i] = Fp.mul(acc, inverted[i]);
  	        return Fp.mul(acc, num);
  	    }, invertedAcc);
  	    return inverted;
  	}
  	// TODO: remove
  	function FpDiv(Fp, lhs, rhs) {
  	    return Fp.mul(lhs, typeof rhs === 'bigint' ? invert(rhs, Fp.ORDER) : Fp.inv(rhs));
  	}
  	/**
  	 * Legendre symbol.
  	 * Legendre constant is used to calculate Legendre symbol (a | p)
  	 * which denotes the value of a^((p-1)/2) (mod p).
  	 *
  	 * * (a | p) ≡ 1    if a is a square (mod p), quadratic residue
  	 * * (a | p) ≡ -1   if a is not a square (mod p), quadratic non residue
  	 * * (a | p) ≡ 0    if a ≡ 0 (mod p)
  	 */
  	function FpLegendre(Fp, n) {
  	    // We can use 3rd argument as optional cache of this value
  	    // but seems unneeded for now. The operation is very fast.
  	    const p1mod2 = (Fp.ORDER - _1n) / _2n;
  	    const powered = Fp.pow(n, p1mod2);
  	    const yes = Fp.eql(powered, Fp.ONE);
  	    const zero = Fp.eql(powered, Fp.ZERO);
  	    const no = Fp.eql(powered, Fp.neg(Fp.ONE));
  	    if (!yes && !zero && !no)
  	        throw new Error('invalid Legendre symbol result');
  	    return yes ? 1 : zero ? 0 : -1;
  	}
  	// This function returns True whenever the value x is a square in the field F.
  	function FpIsSquare(Fp, n) {
  	    const l = FpLegendre(Fp, n);
  	    return l === 1;
  	}
  	// CURVE.n lengths
  	function nLength(n, nBitLength) {
  	    // Bit size, byte size of CURVE.n
  	    if (nBitLength !== undefined)
  	        (0, utils_ts_1.anumber)(nBitLength);
  	    const _nBitLength = nBitLength !== undefined ? nBitLength : n.toString(2).length;
  	    const nByteLength = Math.ceil(_nBitLength / 8);
  	    return { nBitLength: _nBitLength, nByteLength };
  	}
  	/**
  	 * Creates a finite field. Major performance optimizations:
  	 * * 1. Denormalized operations like mulN instead of mul.
  	 * * 2. Identical object shape: never add or remove keys.
  	 * * 3. `Object.freeze`.
  	 * Fragile: always run a benchmark on a change.
  	 * Security note: operations don't check 'isValid' for all elements for performance reasons,
  	 * it is caller responsibility to check this.
  	 * This is low-level code, please make sure you know what you're doing.
  	 *
  	 * Note about field properties:
  	 * * CHARACTERISTIC p = prime number, number of elements in main subgroup.
  	 * * ORDER q = similar to cofactor in curves, may be composite `q = p^m`.
  	 *
  	 * @param ORDER field order, probably prime, or could be composite
  	 * @param bitLen how many bits the field consumes
  	 * @param isLE (default: false) if encoding / decoding should be in little-endian
  	 * @param redef optional faster redefinitions of sqrt and other methods
  	 */
  	function Field(ORDER, bitLenOrOpts, // TODO: use opts only in v2?
  	isLE = false, opts = {}) {
  	    if (ORDER <= _0n)
  	        throw new Error('invalid field: expected ORDER > 0, got ' + ORDER);
  	    let _nbitLength = undefined;
  	    let _sqrt = undefined;
  	    let modOnDecode = false;
  	    let allowedLengths = undefined;
  	    if (typeof bitLenOrOpts === 'object' && bitLenOrOpts != null) {
  	        if (opts.sqrt || isLE)
  	            throw new Error('cannot specify opts in two arguments');
  	        const _opts = bitLenOrOpts;
  	        if (_opts.BITS)
  	            _nbitLength = _opts.BITS;
  	        if (_opts.sqrt)
  	            _sqrt = _opts.sqrt;
  	        if (typeof _opts.isLE === 'boolean')
  	            isLE = _opts.isLE;
  	        if (typeof _opts.modOnDecode === 'boolean')
  	            modOnDecode = _opts.modOnDecode;
  	        allowedLengths = _opts.allowedLengths;
  	    }
  	    else {
  	        if (typeof bitLenOrOpts === 'number')
  	            _nbitLength = bitLenOrOpts;
  	        if (opts.sqrt)
  	            _sqrt = opts.sqrt;
  	    }
  	    const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, _nbitLength);
  	    if (BYTES > 2048)
  	        throw new Error('invalid field: expected ORDER of <= 2048 bytes');
  	    let sqrtP; // cached sqrtP
  	    const f = Object.freeze({
  	        ORDER,
  	        isLE,
  	        BITS,
  	        BYTES,
  	        MASK: (0, utils_ts_1.bitMask)(BITS),
  	        ZERO: _0n,
  	        ONE: _1n,
  	        allowedLengths: allowedLengths,
  	        create: (num) => mod(num, ORDER),
  	        isValid: (num) => {
  	            if (typeof num !== 'bigint')
  	                throw new Error('invalid field element: expected bigint, got ' + typeof num);
  	            return _0n <= num && num < ORDER; // 0 is valid element, but it's not invertible
  	        },
  	        is0: (num) => num === _0n,
  	        // is valid and invertible
  	        isValidNot0: (num) => !f.is0(num) && f.isValid(num),
  	        isOdd: (num) => (num & _1n) === _1n,
  	        neg: (num) => mod(-num, ORDER),
  	        eql: (lhs, rhs) => lhs === rhs,
  	        sqr: (num) => mod(num * num, ORDER),
  	        add: (lhs, rhs) => mod(lhs + rhs, ORDER),
  	        sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
  	        mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
  	        pow: (num, power) => FpPow(f, num, power),
  	        div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
  	        // Same as above, but doesn't normalize
  	        sqrN: (num) => num * num,
  	        addN: (lhs, rhs) => lhs + rhs,
  	        subN: (lhs, rhs) => lhs - rhs,
  	        mulN: (lhs, rhs) => lhs * rhs,
  	        inv: (num) => invert(num, ORDER),
  	        sqrt: _sqrt ||
  	            ((n) => {
  	                if (!sqrtP)
  	                    sqrtP = FpSqrt(ORDER);
  	                return sqrtP(f, n);
  	            }),
  	        toBytes: (num) => (isLE ? (0, utils_ts_1.numberToBytesLE)(num, BYTES) : (0, utils_ts_1.numberToBytesBE)(num, BYTES)),
  	        fromBytes: (bytes, skipValidation = true) => {
  	            if (allowedLengths) {
  	                if (!allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
  	                    throw new Error('Field.fromBytes: expected ' + allowedLengths + ' bytes, got ' + bytes.length);
  	                }
  	                const padded = new Uint8Array(BYTES);
  	                // isLE add 0 to right, !isLE to the left.
  	                padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
  	                bytes = padded;
  	            }
  	            if (bytes.length !== BYTES)
  	                throw new Error('Field.fromBytes: expected ' + BYTES + ' bytes, got ' + bytes.length);
  	            let scalar = isLE ? (0, utils_ts_1.bytesToNumberLE)(bytes) : (0, utils_ts_1.bytesToNumberBE)(bytes);
  	            if (modOnDecode)
  	                scalar = mod(scalar, ORDER);
  	            if (!skipValidation)
  	                if (!f.isValid(scalar))
  	                    throw new Error('invalid field element: outside of range 0..ORDER');
  	            // NOTE: we don't validate scalar here, please use isValid. This done such way because some
  	            // protocol may allow non-reduced scalar that reduced later or changed some other way.
  	            return scalar;
  	        },
  	        // TODO: we don't need it here, move out to separate fn
  	        invertBatch: (lst) => FpInvertBatch(f, lst),
  	        // We can't move this out because Fp6, Fp12 implement it
  	        // and it's unclear what to return in there.
  	        cmov: (a, b, c) => (c ? b : a),
  	    });
  	    return Object.freeze(f);
  	}
  	// Generic random scalar, we can do same for other fields if via Fp2.mul(Fp2.ONE, Fp2.random)?
  	// This allows unsafe methods like ignore bias or zero. These unsafe, but often used in different protocols (if deterministic RNG).
  	// which mean we cannot force this via opts.
  	// Not sure what to do with randomBytes, we can accept it inside opts if wanted.
  	// Probably need to export getMinHashLength somewhere?
  	// random(bytes?: Uint8Array, unsafeAllowZero = false, unsafeAllowBias = false) {
  	//   const LEN = !unsafeAllowBias ? getMinHashLength(ORDER) : BYTES;
  	//   if (bytes === undefined) bytes = randomBytes(LEN); // _opts.randomBytes?
  	//   const num = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
  	//   // `mod(x, 11)` can sometimes produce 0. `mod(x, 10) + 1` is the same, but no 0
  	//   const reduced = unsafeAllowZero ? mod(num, ORDER) : mod(num, ORDER - _1n) + _1n;
  	//   return reduced;
  	// },
  	function FpSqrtOdd(Fp, elm) {
  	    if (!Fp.isOdd)
  	        throw new Error("Field doesn't have isOdd");
  	    const root = Fp.sqrt(elm);
  	    return Fp.isOdd(root) ? root : Fp.neg(root);
  	}
  	function FpSqrtEven(Fp, elm) {
  	    if (!Fp.isOdd)
  	        throw new Error("Field doesn't have isOdd");
  	    const root = Fp.sqrt(elm);
  	    return Fp.isOdd(root) ? Fp.neg(root) : root;
  	}
  	/**
  	 * "Constant-time" private key generation utility.
  	 * Same as mapKeyToField, but accepts less bytes (40 instead of 48 for 32-byte field).
  	 * Which makes it slightly more biased, less secure.
  	 * @deprecated use `mapKeyToField` instead
  	 */
  	function hashToPrivateScalar(hash, groupOrder, isLE = false) {
  	    hash = (0, utils_ts_1.ensureBytes)('privateHash', hash);
  	    const hashLen = hash.length;
  	    const minLen = nLength(groupOrder).nByteLength + 8;
  	    if (minLen < 24 || hashLen < minLen || hashLen > 1024)
  	        throw new Error('hashToPrivateScalar: expected ' + minLen + '-1024 bytes of input, got ' + hashLen);
  	    const num = isLE ? (0, utils_ts_1.bytesToNumberLE)(hash) : (0, utils_ts_1.bytesToNumberBE)(hash);
  	    return mod(num, groupOrder - _1n) + _1n;
  	}
  	/**
  	 * Returns total number of bytes consumed by the field element.
  	 * For example, 32 bytes for usual 256-bit weierstrass curve.
  	 * @param fieldOrder number of field elements, usually CURVE.n
  	 * @returns byte length of field
  	 */
  	function getFieldBytesLength(fieldOrder) {
  	    if (typeof fieldOrder !== 'bigint')
  	        throw new Error('field order must be bigint');
  	    const bitLength = fieldOrder.toString(2).length;
  	    return Math.ceil(bitLength / 8);
  	}
  	/**
  	 * Returns minimal amount of bytes that can be safely reduced
  	 * by field order.
  	 * Should be 2^-128 for 128-bit curve such as P256.
  	 * @param fieldOrder number of field elements, usually CURVE.n
  	 * @returns byte length of target hash
  	 */
  	function getMinHashLength(fieldOrder) {
  	    const length = getFieldBytesLength(fieldOrder);
  	    return length + Math.ceil(length / 2);
  	}
  	/**
  	 * "Constant-time" private key generation utility.
  	 * Can take (n + n/2) or more bytes of uniform input e.g. from CSPRNG or KDF
  	 * and convert them into private scalar, with the modulo bias being negligible.
  	 * Needs at least 48 bytes of input for 32-byte private key.
  	 * https://research.kudelskisecurity.com/2020/07/28/the-definitive-guide-to-modulo-bias-and-how-to-avoid-it/
  	 * FIPS 186-5, A.2 https://csrc.nist.gov/publications/detail/fips/186/5/final
  	 * RFC 9380, https://www.rfc-editor.org/rfc/rfc9380#section-5
  	 * @param hash hash output from SHA3 or a similar function
  	 * @param groupOrder size of subgroup - (e.g. secp256k1.CURVE.n)
  	 * @param isLE interpret hash bytes as LE num
  	 * @returns valid private scalar
  	 */
  	function mapHashToField(key, fieldOrder, isLE = false) {
  	    const len = key.length;
  	    const fieldLen = getFieldBytesLength(fieldOrder);
  	    const minLen = getMinHashLength(fieldOrder);
  	    // No small numbers: need to understand bias story. No huge numbers: easier to detect JS timings.
  	    if (len < 16 || len < minLen || len > 1024)
  	        throw new Error('expected ' + minLen + '-1024 bytes of input, got ' + len);
  	    const num = isLE ? (0, utils_ts_1.bytesToNumberLE)(key) : (0, utils_ts_1.bytesToNumberBE)(key);
  	    // `mod(x, 11)` can sometimes produce 0. `mod(x, 10) + 1` is the same, but no 0
  	    const reduced = mod(num, fieldOrder - _1n) + _1n;
  	    return isLE ? (0, utils_ts_1.numberToBytesLE)(reduced, fieldLen) : (0, utils_ts_1.numberToBytesBE)(reduced, fieldLen);
  	}
  	
  	return modular;
  }

  var hasRequiredCurve;

  function requireCurve () {
  	if (hasRequiredCurve) return curve;
  	hasRequiredCurve = 1;
  	Object.defineProperty(curve, "__esModule", { value: true });
  	curve.wNAF = void 0;
  	curve.negateCt = negateCt;
  	curve.normalizeZ = normalizeZ;
  	curve.mulEndoUnsafe = mulEndoUnsafe;
  	curve.pippenger = pippenger;
  	curve.precomputeMSMUnsafe = precomputeMSMUnsafe;
  	curve.validateBasic = validateBasic;
  	curve._createCurveFields = _createCurveFields;
  	/**
  	 * Methods for elliptic curve multiplication by scalars.
  	 * Contains wNAF, pippenger.
  	 * @module
  	 */
  	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$1();
  	const modular_ts_1 = /*@__PURE__*/ requireModular();
  	const _0n = BigInt(0);
  	const _1n = BigInt(1);
  	function negateCt(condition, item) {
  	    const neg = item.negate();
  	    return condition ? neg : item;
  	}
  	/**
  	 * Takes a bunch of Projective Points but executes only one
  	 * inversion on all of them. Inversion is very slow operation,
  	 * so this improves performance massively.
  	 * Optimization: converts a list of projective points to a list of identical points with Z=1.
  	 */
  	function normalizeZ(c, points) {
  	    const invertedZs = (0, modular_ts_1.FpInvertBatch)(c.Fp, points.map((p) => p.Z));
  	    return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
  	}
  	function validateW(W, bits) {
  	    if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
  	        throw new Error('invalid window size, expected [1..' + bits + '], got W=' + W);
  	}
  	function calcWOpts(W, scalarBits) {
  	    validateW(W, scalarBits);
  	    const windows = Math.ceil(scalarBits / W) + 1; // W=8 33. Not 32, because we skip zero
  	    const windowSize = 2 ** (W - 1); // W=8 128. Not 256, because we skip zero
  	    const maxNumber = 2 ** W; // W=8 256
  	    const mask = (0, utils_ts_1.bitMask)(W); // W=8 255 == mask 0b11111111
  	    const shiftBy = BigInt(W); // W=8 8
  	    return { windows, windowSize, mask, maxNumber, shiftBy };
  	}
  	function calcOffsets(n, window, wOpts) {
  	    const { windowSize, mask, maxNumber, shiftBy } = wOpts;
  	    let wbits = Number(n & mask); // extract W bits.
  	    let nextN = n >> shiftBy; // shift number by W bits.
  	    // What actually happens here:
  	    // const highestBit = Number(mask ^ (mask >> 1n));
  	    // let wbits2 = wbits - 1; // skip zero
  	    // if (wbits2 & highestBit) { wbits2 ^= Number(mask); // (~);
  	    // split if bits > max: +224 => 256-32
  	    if (wbits > windowSize) {
  	        // we skip zero, which means instead of `>= size-1`, we do `> size`
  	        wbits -= maxNumber; // -32, can be maxNumber - wbits, but then we need to set isNeg here.
  	        nextN += _1n; // +256 (carry)
  	    }
  	    const offsetStart = window * windowSize;
  	    const offset = offsetStart + Math.abs(wbits) - 1; // -1 because we skip zero
  	    const isZero = wbits === 0; // is current window slice a 0?
  	    const isNeg = wbits < 0; // is current window slice negative?
  	    const isNegF = window % 2 !== 0; // fake random statement for noise
  	    const offsetF = offsetStart; // fake offset for noise
  	    return { nextN, offset, isZero, isNeg, isNegF, offsetF };
  	}
  	function validateMSMPoints(points, c) {
  	    if (!Array.isArray(points))
  	        throw new Error('array expected');
  	    points.forEach((p, i) => {
  	        if (!(p instanceof c))
  	            throw new Error('invalid point at index ' + i);
  	    });
  	}
  	function validateMSMScalars(scalars, field) {
  	    if (!Array.isArray(scalars))
  	        throw new Error('array of scalars expected');
  	    scalars.forEach((s, i) => {
  	        if (!field.isValid(s))
  	            throw new Error('invalid scalar at index ' + i);
  	    });
  	}
  	// Since points in different groups cannot be equal (different object constructor),
  	// we can have single place to store precomputes.
  	// Allows to make points frozen / immutable.
  	const pointPrecomputes = new WeakMap();
  	const pointWindowSizes = new WeakMap();
  	function getW(P) {
  	    // To disable precomputes:
  	    // return 1;
  	    return pointWindowSizes.get(P) || 1;
  	}
  	function assert0(n) {
  	    if (n !== _0n)
  	        throw new Error('invalid wNAF');
  	}
  	/**
  	 * Elliptic curve multiplication of Point by scalar. Fragile.
  	 * Table generation takes **30MB of ram and 10ms on high-end CPU**,
  	 * but may take much longer on slow devices. Actual generation will happen on
  	 * first call of `multiply()`. By default, `BASE` point is precomputed.
  	 *
  	 * Scalars should always be less than curve order: this should be checked inside of a curve itself.
  	 * Creates precomputation tables for fast multiplication:
  	 * - private scalar is split by fixed size windows of W bits
  	 * - every window point is collected from window's table & added to accumulator
  	 * - since windows are different, same point inside tables won't be accessed more than once per calc
  	 * - each multiplication is 'Math.ceil(CURVE_ORDER / 𝑊) + 1' point additions (fixed for any scalar)
  	 * - +1 window is neccessary for wNAF
  	 * - wNAF reduces table size: 2x less memory + 2x faster generation, but 10% slower multiplication
  	 *
  	 * @todo Research returning 2d JS array of windows, instead of a single window.
  	 * This would allow windows to be in different memory locations
  	 */
  	class wNAF {
  	    // Parametrized with a given Point class (not individual point)
  	    constructor(Point, bits) {
  	        this.BASE = Point.BASE;
  	        this.ZERO = Point.ZERO;
  	        this.Fn = Point.Fn;
  	        this.bits = bits;
  	    }
  	    // non-const time multiplication ladder
  	    _unsafeLadder(elm, n, p = this.ZERO) {
  	        let d = elm;
  	        while (n > _0n) {
  	            if (n & _1n)
  	                p = p.add(d);
  	            d = d.double();
  	            n >>= _1n;
  	        }
  	        return p;
  	    }
  	    /**
  	     * Creates a wNAF precomputation window. Used for caching.
  	     * Default window size is set by `utils.precompute()` and is equal to 8.
  	     * Number of precomputed points depends on the curve size:
  	     * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
  	     * - 𝑊 is the window size
  	     * - 𝑛 is the bitlength of the curve order.
  	     * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
  	     * @param point Point instance
  	     * @param W window size
  	     * @returns precomputed point tables flattened to a single array
  	     */
  	    precomputeWindow(point, W) {
  	        const { windows, windowSize } = calcWOpts(W, this.bits);
  	        const points = [];
  	        let p = point;
  	        let base = p;
  	        for (let window = 0; window < windows; window++) {
  	            base = p;
  	            points.push(base);
  	            // i=1, bc we skip 0
  	            for (let i = 1; i < windowSize; i++) {
  	                base = base.add(p);
  	                points.push(base);
  	            }
  	            p = base.double();
  	        }
  	        return points;
  	    }
  	    /**
  	     * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
  	     * More compact implementation:
  	     * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
  	     * @returns real and fake (for const-time) points
  	     */
  	    wNAF(W, precomputes, n) {
  	        // Scalar should be smaller than field order
  	        if (!this.Fn.isValid(n))
  	            throw new Error('invalid scalar');
  	        // Accumulators
  	        let p = this.ZERO;
  	        let f = this.BASE;
  	        // This code was first written with assumption that 'f' and 'p' will never be infinity point:
  	        // since each addition is multiplied by 2 ** W, it cannot cancel each other. However,
  	        // there is negate now: it is possible that negated element from low value
  	        // would be the same as high element, which will create carry into next window.
  	        // It's not obvious how this can fail, but still worth investigating later.
  	        const wo = calcWOpts(W, this.bits);
  	        for (let window = 0; window < wo.windows; window++) {
  	            // (n === _0n) is handled and not early-exited. isEven and offsetF are used for noise
  	            const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window, wo);
  	            n = nextN;
  	            if (isZero) {
  	                // bits are 0: add garbage to fake point
  	                // Important part for const-time getPublicKey: add random "noise" point to f.
  	                f = f.add(negateCt(isNegF, precomputes[offsetF]));
  	            }
  	            else {
  	                // bits are 1: add to result point
  	                p = p.add(negateCt(isNeg, precomputes[offset]));
  	            }
  	        }
  	        assert0(n);
  	        // Return both real and fake points: JIT won't eliminate f.
  	        // At this point there is a way to F be infinity-point even if p is not,
  	        // which makes it less const-time: around 1 bigint multiply.
  	        return { p, f };
  	    }
  	    /**
  	     * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
  	     * @param acc accumulator point to add result of multiplication
  	     * @returns point
  	     */
  	    wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
  	        const wo = calcWOpts(W, this.bits);
  	        for (let window = 0; window < wo.windows; window++) {
  	            if (n === _0n)
  	                break; // Early-exit, skip 0 value
  	            const { nextN, offset, isZero, isNeg } = calcOffsets(n, window, wo);
  	            n = nextN;
  	            if (isZero) {
  	                // Window bits are 0: skip processing.
  	                // Move to next window.
  	                continue;
  	            }
  	            else {
  	                const item = precomputes[offset];
  	                acc = acc.add(isNeg ? item.negate() : item); // Re-using acc allows to save adds in MSM
  	            }
  	        }
  	        assert0(n);
  	        return acc;
  	    }
  	    getPrecomputes(W, point, transform) {
  	        // Calculate precomputes on a first run, reuse them after
  	        let comp = pointPrecomputes.get(point);
  	        if (!comp) {
  	            comp = this.precomputeWindow(point, W);
  	            if (W !== 1) {
  	                // Doing transform outside of if brings 15% perf hit
  	                if (typeof transform === 'function')
  	                    comp = transform(comp);
  	                pointPrecomputes.set(point, comp);
  	            }
  	        }
  	        return comp;
  	    }
  	    cached(point, scalar, transform) {
  	        const W = getW(point);
  	        return this.wNAF(W, this.getPrecomputes(W, point, transform), scalar);
  	    }
  	    unsafe(point, scalar, transform, prev) {
  	        const W = getW(point);
  	        if (W === 1)
  	            return this._unsafeLadder(point, scalar, prev); // For W=1 ladder is ~x2 faster
  	        return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform), scalar, prev);
  	    }
  	    // We calculate precomputes for elliptic curve point multiplication
  	    // using windowed method. This specifies window size and
  	    // stores precomputed values. Usually only base point would be precomputed.
  	    createCache(P, W) {
  	        validateW(W, this.bits);
  	        pointWindowSizes.set(P, W);
  	        pointPrecomputes.delete(P);
  	    }
  	    hasCache(elm) {
  	        return getW(elm) !== 1;
  	    }
  	}
  	curve.wNAF = wNAF;
  	/**
  	 * Endomorphism-specific multiplication for Koblitz curves.
  	 * Cost: 128 dbl, 0-256 adds.
  	 */
  	function mulEndoUnsafe(Point, point, k1, k2) {
  	    let acc = point;
  	    let p1 = Point.ZERO;
  	    let p2 = Point.ZERO;
  	    while (k1 > _0n || k2 > _0n) {
  	        if (k1 & _1n)
  	            p1 = p1.add(acc);
  	        if (k2 & _1n)
  	            p2 = p2.add(acc);
  	        acc = acc.double();
  	        k1 >>= _1n;
  	        k2 >>= _1n;
  	    }
  	    return { p1, p2 };
  	}
  	/**
  	 * Pippenger algorithm for multi-scalar multiplication (MSM, Pa + Qb + Rc + ...).
  	 * 30x faster vs naive addition on L=4096, 10x faster than precomputes.
  	 * For N=254bit, L=1, it does: 1024 ADD + 254 DBL. For L=5: 1536 ADD + 254 DBL.
  	 * Algorithmically constant-time (for same L), even when 1 point + scalar, or when scalar = 0.
  	 * @param c Curve Point constructor
  	 * @param fieldN field over CURVE.N - important that it's not over CURVE.P
  	 * @param points array of L curve points
  	 * @param scalars array of L scalars (aka secret keys / bigints)
  	 */
  	function pippenger(c, fieldN, points, scalars) {
  	    // If we split scalars by some window (let's say 8 bits), every chunk will only
  	    // take 256 buckets even if there are 4096 scalars, also re-uses double.
  	    // TODO:
  	    // - https://eprint.iacr.org/2024/750.pdf
  	    // - https://tches.iacr.org/index.php/TCHES/article/view/10287
  	    // 0 is accepted in scalars
  	    validateMSMPoints(points, c);
  	    validateMSMScalars(scalars, fieldN);
  	    const plength = points.length;
  	    const slength = scalars.length;
  	    if (plength !== slength)
  	        throw new Error('arrays of points and scalars must have equal length');
  	    // if (plength === 0) throw new Error('array must be of length >= 2');
  	    const zero = c.ZERO;
  	    const wbits = (0, utils_ts_1.bitLen)(BigInt(plength));
  	    let windowSize = 1; // bits
  	    if (wbits > 12)
  	        windowSize = wbits - 3;
  	    else if (wbits > 4)
  	        windowSize = wbits - 2;
  	    else if (wbits > 0)
  	        windowSize = 2;
  	    const MASK = (0, utils_ts_1.bitMask)(windowSize);
  	    const buckets = new Array(Number(MASK) + 1).fill(zero); // +1 for zero array
  	    const lastBits = Math.floor((fieldN.BITS - 1) / windowSize) * windowSize;
  	    let sum = zero;
  	    for (let i = lastBits; i >= 0; i -= windowSize) {
  	        buckets.fill(zero);
  	        for (let j = 0; j < slength; j++) {
  	            const scalar = scalars[j];
  	            const wbits = Number((scalar >> BigInt(i)) & MASK);
  	            buckets[wbits] = buckets[wbits].add(points[j]);
  	        }
  	        let resI = zero; // not using this will do small speed-up, but will lose ct
  	        // Skip first bucket, because it is zero
  	        for (let j = buckets.length - 1, sumI = zero; j > 0; j--) {
  	            sumI = sumI.add(buckets[j]);
  	            resI = resI.add(sumI);
  	        }
  	        sum = sum.add(resI);
  	        if (i !== 0)
  	            for (let j = 0; j < windowSize; j++)
  	                sum = sum.double();
  	    }
  	    return sum;
  	}
  	/**
  	 * Precomputed multi-scalar multiplication (MSM, Pa + Qb + Rc + ...).
  	 * @param c Curve Point constructor
  	 * @param fieldN field over CURVE.N - important that it's not over CURVE.P
  	 * @param points array of L curve points
  	 * @returns function which multiplies points with scaars
  	 */
  	function precomputeMSMUnsafe(c, fieldN, points, windowSize) {
  	    /**
  	     * Performance Analysis of Window-based Precomputation
  	     *
  	     * Base Case (256-bit scalar, 8-bit window):
  	     * - Standard precomputation requires:
  	     *   - 31 additions per scalar × 256 scalars = 7,936 ops
  	     *   - Plus 255 summary additions = 8,191 total ops
  	     *   Note: Summary additions can be optimized via accumulator
  	     *
  	     * Chunked Precomputation Analysis:
  	     * - Using 32 chunks requires:
  	     *   - 255 additions per chunk
  	     *   - 256 doublings
  	     *   - Total: (255 × 32) + 256 = 8,416 ops
  	     *
  	     * Memory Usage Comparison:
  	     * Window Size | Standard Points | Chunked Points
  	     * ------------|-----------------|---------------
  	     *     4-bit   |     520         |      15
  	     *     8-bit   |    4,224        |     255
  	     *    10-bit   |   13,824        |   1,023
  	     *    16-bit   |  557,056        |  65,535
  	     *
  	     * Key Advantages:
  	     * 1. Enables larger window sizes due to reduced memory overhead
  	     * 2. More efficient for smaller scalar counts:
  	     *    - 16 chunks: (16 × 255) + 256 = 4,336 ops
  	     *    - ~2x faster than standard 8,191 ops
  	     *
  	     * Limitations:
  	     * - Not suitable for plain precomputes (requires 256 constant doublings)
  	     * - Performance degrades with larger scalar counts:
  	     *   - Optimal for ~256 scalars
  	     *   - Less efficient for 4096+ scalars (Pippenger preferred)
  	     */
  	    validateW(windowSize, fieldN.BITS);
  	    validateMSMPoints(points, c);
  	    const zero = c.ZERO;
  	    const tableSize = 2 ** windowSize - 1; // table size (without zero)
  	    const chunks = Math.ceil(fieldN.BITS / windowSize); // chunks of item
  	    const MASK = (0, utils_ts_1.bitMask)(windowSize);
  	    const tables = points.map((p) => {
  	        const res = [];
  	        for (let i = 0, acc = p; i < tableSize; i++) {
  	            res.push(acc);
  	            acc = acc.add(p);
  	        }
  	        return res;
  	    });
  	    return (scalars) => {
  	        validateMSMScalars(scalars, fieldN);
  	        if (scalars.length > points.length)
  	            throw new Error('array of scalars must be smaller than array of points');
  	        let res = zero;
  	        for (let i = 0; i < chunks; i++) {
  	            // No need to double if accumulator is still zero.
  	            if (res !== zero)
  	                for (let j = 0; j < windowSize; j++)
  	                    res = res.double();
  	            const shiftBy = BigInt(chunks * windowSize - (i + 1) * windowSize);
  	            for (let j = 0; j < scalars.length; j++) {
  	                const n = scalars[j];
  	                const curr = Number((n >> shiftBy) & MASK);
  	                if (!curr)
  	                    continue; // skip zero scalars chunks
  	                res = res.add(tables[j][curr - 1]);
  	            }
  	        }
  	        return res;
  	    };
  	}
  	// TODO: remove
  	/** @deprecated */
  	function validateBasic(curve) {
  	    (0, modular_ts_1.validateField)(curve.Fp);
  	    (0, utils_ts_1.validateObject)(curve, {
  	        n: 'bigint',
  	        h: 'bigint',
  	        Gx: 'field',
  	        Gy: 'field',
  	    }, {
  	        nBitLength: 'isSafeInteger',
  	        nByteLength: 'isSafeInteger',
  	    });
  	    // Set defaults
  	    return Object.freeze({
  	        ...(0, modular_ts_1.nLength)(curve.n, curve.nBitLength),
  	        ...curve,
  	        ...{ p: curve.Fp.ORDER },
  	    });
  	}
  	function createField(order, field) {
  	    if (field) {
  	        if (field.ORDER !== order)
  	            throw new Error('Field.ORDER must match order: Fp == p, Fn == n');
  	        (0, modular_ts_1.validateField)(field);
  	        return field;
  	    }
  	    else {
  	        return (0, modular_ts_1.Field)(order);
  	    }
  	}
  	/** Validates CURVE opts and creates fields */
  	function _createCurveFields(type, CURVE, curveOpts = {}) {
  	    if (!CURVE || typeof CURVE !== 'object')
  	        throw new Error(`expected valid ${type} CURVE object`);
  	    for (const p of ['p', 'n', 'h']) {
  	        const val = CURVE[p];
  	        if (!(typeof val === 'bigint' && val > _0n))
  	            throw new Error(`CURVE.${p} must be positive bigint`);
  	    }
  	    const Fp = createField(CURVE.p, curveOpts.Fp);
  	    const Fn = createField(CURVE.n, curveOpts.Fn);
  	    const _b = type === 'weierstrass' ? 'b' : 'd';
  	    const params = ['Gx', 'Gy', 'a', _b];
  	    for (const p of params) {
  	        // @ts-ignore
  	        if (!Fp.isValid(CURVE[p]))
  	            throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  	    }
  	    return { Fp, Fn };
  	}
  	
  	return curve;
  }

  var edwards = {};

  var hasRequiredEdwards;

  function requireEdwards () {
  	if (hasRequiredEdwards) return edwards;
  	hasRequiredEdwards = 1;
  	Object.defineProperty(edwards, "__esModule", { value: true });
  	edwards.PrimeEdwardsPoint = void 0;
  	edwards.edwards = edwards$1;
  	edwards.eddsa = eddsa;
  	edwards.twistedEdwards = twistedEdwards;
  	/**
  	 * Twisted Edwards curve. The formula is: ax² + y² = 1 + dx²y².
  	 * For design rationale of types / exports, see weierstrass module documentation.
  	 * Untwisted Edwards curves exist, but they aren't used in real-world protocols.
  	 * @module
  	 */
  	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$1();
  	const curve_ts_1 = /*@__PURE__*/ requireCurve();
  	const modular_ts_1 = /*@__PURE__*/ requireModular();
  	// Be friendly to bad ECMAScript parsers by not using bigint literals
  	// prettier-ignore
  	const _0n = BigInt(0), _1n = BigInt(1), _2n = BigInt(2), _8n = BigInt(8);
  	function isEdValidXY(Fp, CURVE, x, y) {
  	    const x2 = Fp.sqr(x);
  	    const y2 = Fp.sqr(y);
  	    const left = Fp.add(Fp.mul(CURVE.a, x2), y2);
  	    const right = Fp.add(Fp.ONE, Fp.mul(CURVE.d, Fp.mul(x2, y2)));
  	    return Fp.eql(left, right);
  	}
  	function edwards$1(CURVE, curveOpts = {}) {
  	    const { Fp, Fn } = (0, curve_ts_1._createCurveFields)('edwards', CURVE, curveOpts);
  	    const { h: cofactor, n: CURVE_ORDER } = CURVE;
  	    (0, utils_ts_1._validateObject)(curveOpts, {}, { uvRatio: 'function' });
  	    // Important:
  	    // There are some places where Fp.BYTES is used instead of nByteLength.
  	    // So far, everything has been tested with curves of Fp.BYTES == nByteLength.
  	    // TODO: test and find curves which behave otherwise.
  	    const MASK = _2n << (BigInt(Fn.BYTES * 8) - _1n);
  	    const modP = (n) => Fp.create(n); // Function overrides
  	    // sqrt(u/v)
  	    const uvRatio = curveOpts.uvRatio ||
  	        ((u, v) => {
  	            try {
  	                return { isValid: true, value: Fp.sqrt(Fp.div(u, v)) };
  	            }
  	            catch (e) {
  	                return { isValid: false, value: _0n };
  	            }
  	        });
  	    // Validate whether the passed curve params are valid.
  	    // equation ax² + y² = 1 + dx²y² should work for generator point.
  	    if (!isEdValidXY(Fp, CURVE, CURVE.Gx, CURVE.Gy))
  	        throw new Error('bad curve params: generator point');
  	    /**
  	     * Asserts coordinate is valid: 0 <= n < MASK.
  	     * Coordinates >= Fp.ORDER are allowed for zip215.
  	     */
  	    function acoord(title, n, banZero = false) {
  	        const min = banZero ? _1n : _0n;
  	        (0, utils_ts_1.aInRange)('coordinate ' + title, n, min, MASK);
  	        return n;
  	    }
  	    function aextpoint(other) {
  	        if (!(other instanceof Point))
  	            throw new Error('ExtendedPoint expected');
  	    }
  	    // Converts Extended point to default (x, y) coordinates.
  	    // Can accept precomputed Z^-1 - for example, from invertBatch.
  	    const toAffineMemo = (0, utils_ts_1.memoized)((p, iz) => {
  	        const { X, Y, Z } = p;
  	        const is0 = p.is0();
  	        if (iz == null)
  	            iz = is0 ? _8n : Fp.inv(Z); // 8 was chosen arbitrarily
  	        const x = modP(X * iz);
  	        const y = modP(Y * iz);
  	        const zz = Fp.mul(Z, iz);
  	        if (is0)
  	            return { x: _0n, y: _1n };
  	        if (zz !== _1n)
  	            throw new Error('invZ was invalid');
  	        return { x, y };
  	    });
  	    const assertValidMemo = (0, utils_ts_1.memoized)((p) => {
  	        const { a, d } = CURVE;
  	        if (p.is0())
  	            throw new Error('bad point: ZERO'); // TODO: optimize, with vars below?
  	        // Equation in affine coordinates: ax² + y² = 1 + dx²y²
  	        // Equation in projective coordinates (X/Z, Y/Z, Z):  (aX² + Y²)Z² = Z⁴ + dX²Y²
  	        const { X, Y, Z, T } = p;
  	        const X2 = modP(X * X); // X²
  	        const Y2 = modP(Y * Y); // Y²
  	        const Z2 = modP(Z * Z); // Z²
  	        const Z4 = modP(Z2 * Z2); // Z⁴
  	        const aX2 = modP(X2 * a); // aX²
  	        const left = modP(Z2 * modP(aX2 + Y2)); // (aX² + Y²)Z²
  	        const right = modP(Z4 + modP(d * modP(X2 * Y2))); // Z⁴ + dX²Y²
  	        if (left !== right)
  	            throw new Error('bad point: equation left != right (1)');
  	        // In Extended coordinates we also have T, which is x*y=T/Z: check X*Y == Z*T
  	        const XY = modP(X * Y);
  	        const ZT = modP(Z * T);
  	        if (XY !== ZT)
  	            throw new Error('bad point: equation left != right (2)');
  	        return true;
  	    });
  	    // Extended Point works in extended coordinates: (X, Y, Z, T) ∋ (x=X/Z, y=Y/Z, T=xy).
  	    // https://en.wikipedia.org/wiki/Twisted_Edwards_curve#Extended_coordinates
  	    class Point {
  	        constructor(X, Y, Z, T) {
  	            this.X = acoord('x', X);
  	            this.Y = acoord('y', Y);
  	            this.Z = acoord('z', Z, true);
  	            this.T = acoord('t', T);
  	            Object.freeze(this);
  	        }
  	        get x() {
  	            return this.toAffine().x;
  	        }
  	        get y() {
  	            return this.toAffine().y;
  	        }
  	        // TODO: remove
  	        get ex() {
  	            return this.X;
  	        }
  	        get ey() {
  	            return this.Y;
  	        }
  	        get ez() {
  	            return this.Z;
  	        }
  	        get et() {
  	            return this.T;
  	        }
  	        static normalizeZ(points) {
  	            return (0, curve_ts_1.normalizeZ)(Point, points);
  	        }
  	        static msm(points, scalars) {
  	            return (0, curve_ts_1.pippenger)(Point, Fn, points, scalars);
  	        }
  	        _setWindowSize(windowSize) {
  	            this.precompute(windowSize);
  	        }
  	        static fromAffine(p) {
  	            if (p instanceof Point)
  	                throw new Error('extended point not allowed');
  	            const { x, y } = p || {};
  	            acoord('x', x);
  	            acoord('y', y);
  	            return new Point(x, y, _1n, modP(x * y));
  	        }
  	        precompute(windowSize = 8, isLazy = true) {
  	            wnaf.createCache(this, windowSize);
  	            if (!isLazy)
  	                this.multiply(_2n); // random number
  	            return this;
  	        }
  	        // Useful in fromAffine() - not for fromBytes(), which always created valid points.
  	        assertValidity() {
  	            assertValidMemo(this);
  	        }
  	        // Compare one point to another.
  	        equals(other) {
  	            aextpoint(other);
  	            const { X: X1, Y: Y1, Z: Z1 } = this;
  	            const { X: X2, Y: Y2, Z: Z2 } = other;
  	            const X1Z2 = modP(X1 * Z2);
  	            const X2Z1 = modP(X2 * Z1);
  	            const Y1Z2 = modP(Y1 * Z2);
  	            const Y2Z1 = modP(Y2 * Z1);
  	            return X1Z2 === X2Z1 && Y1Z2 === Y2Z1;
  	        }
  	        is0() {
  	            return this.equals(Point.ZERO);
  	        }
  	        negate() {
  	            // Flips point sign to a negative one (-x, y in affine coords)
  	            return new Point(modP(-this.X), this.Y, this.Z, modP(-this.T));
  	        }
  	        // Fast algo for doubling Extended Point.
  	        // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#doubling-dbl-2008-hwcd
  	        // Cost: 4M + 4S + 1*a + 6add + 1*2.
  	        double() {
  	            const { a } = CURVE;
  	            const { X: X1, Y: Y1, Z: Z1 } = this;
  	            const A = modP(X1 * X1); // A = X12
  	            const B = modP(Y1 * Y1); // B = Y12
  	            const C = modP(_2n * modP(Z1 * Z1)); // C = 2*Z12
  	            const D = modP(a * A); // D = a*A
  	            const x1y1 = X1 + Y1;
  	            const E = modP(modP(x1y1 * x1y1) - A - B); // E = (X1+Y1)2-A-B
  	            const G = D + B; // G = D+B
  	            const F = G - C; // F = G-C
  	            const H = D - B; // H = D-B
  	            const X3 = modP(E * F); // X3 = E*F
  	            const Y3 = modP(G * H); // Y3 = G*H
  	            const T3 = modP(E * H); // T3 = E*H
  	            const Z3 = modP(F * G); // Z3 = F*G
  	            return new Point(X3, Y3, Z3, T3);
  	        }
  	        // Fast algo for adding 2 Extended Points.
  	        // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
  	        // Cost: 9M + 1*a + 1*d + 7add.
  	        add(other) {
  	            aextpoint(other);
  	            const { a, d } = CURVE;
  	            const { X: X1, Y: Y1, Z: Z1, T: T1 } = this;
  	            const { X: X2, Y: Y2, Z: Z2, T: T2 } = other;
  	            const A = modP(X1 * X2); // A = X1*X2
  	            const B = modP(Y1 * Y2); // B = Y1*Y2
  	            const C = modP(T1 * d * T2); // C = T1*d*T2
  	            const D = modP(Z1 * Z2); // D = Z1*Z2
  	            const E = modP((X1 + Y1) * (X2 + Y2) - A - B); // E = (X1+Y1)*(X2+Y2)-A-B
  	            const F = D - C; // F = D-C
  	            const G = D + C; // G = D+C
  	            const H = modP(B - a * A); // H = B-a*A
  	            const X3 = modP(E * F); // X3 = E*F
  	            const Y3 = modP(G * H); // Y3 = G*H
  	            const T3 = modP(E * H); // T3 = E*H
  	            const Z3 = modP(F * G); // Z3 = F*G
  	            return new Point(X3, Y3, Z3, T3);
  	        }
  	        subtract(other) {
  	            return this.add(other.negate());
  	        }
  	        // Constant-time multiplication.
  	        multiply(scalar) {
  	            const n = scalar;
  	            (0, utils_ts_1.aInRange)('scalar', n, _1n, CURVE_ORDER); // 1 <= scalar < L
  	            const { p, f } = wnaf.cached(this, n, (p) => (0, curve_ts_1.normalizeZ)(Point, p));
  	            return (0, curve_ts_1.normalizeZ)(Point, [p, f])[0];
  	        }
  	        // Non-constant-time multiplication. Uses double-and-add algorithm.
  	        // It's faster, but should only be used when you don't care about
  	        // an exposed private key e.g. sig verification.
  	        // Does NOT allow scalars higher than CURVE.n.
  	        // Accepts optional accumulator to merge with multiply (important for sparse scalars)
  	        multiplyUnsafe(scalar, acc = Point.ZERO) {
  	            const n = scalar;
  	            (0, utils_ts_1.aInRange)('scalar', n, _0n, CURVE_ORDER); // 0 <= scalar < L
  	            if (n === _0n)
  	                return Point.ZERO;
  	            if (this.is0() || n === _1n)
  	                return this;
  	            return wnaf.unsafe(this, n, (p) => (0, curve_ts_1.normalizeZ)(Point, p), acc);
  	        }
  	        // Checks if point is of small order.
  	        // If you add something to small order point, you will have "dirty"
  	        // point with torsion component.
  	        // Multiplies point by cofactor and checks if the result is 0.
  	        isSmallOrder() {
  	            return this.multiplyUnsafe(cofactor).is0();
  	        }
  	        // Multiplies point by curve order and checks if the result is 0.
  	        // Returns `false` is the point is dirty.
  	        isTorsionFree() {
  	            return wnaf.unsafe(this, CURVE_ORDER).is0();
  	        }
  	        // Converts Extended point to default (x, y) coordinates.
  	        // Can accept precomputed Z^-1 - for example, from invertBatch.
  	        toAffine(invertedZ) {
  	            return toAffineMemo(this, invertedZ);
  	        }
  	        clearCofactor() {
  	            if (cofactor === _1n)
  	                return this;
  	            return this.multiplyUnsafe(cofactor);
  	        }
  	        static fromBytes(bytes, zip215 = false) {
  	            (0, utils_ts_1.abytes)(bytes);
  	            return Point.fromHex(bytes, zip215);
  	        }
  	        // Converts hash string or Uint8Array to Point.
  	        // Uses algo from RFC8032 5.1.3.
  	        static fromHex(hex, zip215 = false) {
  	            const { d, a } = CURVE;
  	            const len = Fp.BYTES;
  	            hex = (0, utils_ts_1.ensureBytes)('pointHex', hex, len); // copy hex to a new array
  	            (0, utils_ts_1.abool)('zip215', zip215);
  	            const normed = hex.slice(); // copy again, we'll manipulate it
  	            const lastByte = hex[len - 1]; // select last byte
  	            normed[len - 1] = lastByte & -129; // clear last bit
  	            const y = (0, utils_ts_1.bytesToNumberLE)(normed);
  	            // zip215=true is good for consensus-critical apps. =false follows RFC8032 / NIST186-5.
  	            // RFC8032 prohibits >= p, but ZIP215 doesn't
  	            // zip215=true:  0 <= y < MASK (2^256 for ed25519)
  	            // zip215=false: 0 <= y < P (2^255-19 for ed25519)
  	            const max = zip215 ? MASK : Fp.ORDER;
  	            (0, utils_ts_1.aInRange)('pointHex.y', y, _0n, max);
  	            // Ed25519: x² = (y²-1)/(dy²+1) mod p. Ed448: x² = (y²-1)/(dy²-1) mod p. Generic case:
  	            // ax²+y²=1+dx²y² => y²-1=dx²y²-ax² => y²-1=x²(dy²-a) => x²=(y²-1)/(dy²-a)
  	            const y2 = modP(y * y); // denominator is always non-0 mod p.
  	            const u = modP(y2 - _1n); // u = y² - 1
  	            const v = modP(d * y2 - a); // v = d y² + 1.
  	            let { isValid, value: x } = uvRatio(u, v); // √(u/v)
  	            if (!isValid)
  	                throw new Error('Point.fromHex: invalid y coordinate');
  	            const isXOdd = (x & _1n) === _1n; // There are 2 square roots. Use x_0 bit to select proper
  	            const isLastByteOdd = (lastByte & 0x80) !== 0; // x_0, last bit
  	            if (!zip215 && x === _0n && isLastByteOdd)
  	                // if x=0 and x_0 = 1, fail
  	                throw new Error('Point.fromHex: x=0 and x_0=1');
  	            if (isLastByteOdd !== isXOdd)
  	                x = modP(-x); // if x_0 != x mod 2, set x = p-x
  	            return Point.fromAffine({ x, y });
  	        }
  	        toBytes() {
  	            const { x, y } = this.toAffine();
  	            const bytes = (0, utils_ts_1.numberToBytesLE)(y, Fp.BYTES); // each y has 2 x values (x, -y)
  	            bytes[bytes.length - 1] |= x & _1n ? 0x80 : 0; // when compressing, it's enough to store y
  	            return bytes; // and use the last byte to encode sign of x
  	        }
  	        /** @deprecated use `toBytes` */
  	        toRawBytes() {
  	            return this.toBytes();
  	        }
  	        toHex() {
  	            return (0, utils_ts_1.bytesToHex)(this.toBytes());
  	        }
  	        toString() {
  	            return `<Point ${this.is0() ? 'ZERO' : this.toHex()}>`;
  	        }
  	    }
  	    // base / generator point
  	    Point.BASE = new Point(CURVE.Gx, CURVE.Gy, _1n, modP(CURVE.Gx * CURVE.Gy));
  	    // zero / infinity / identity point
  	    Point.ZERO = new Point(_0n, _1n, _1n, _0n); // 0, 1, 1, 0
  	    // fields
  	    Point.Fp = Fp;
  	    Point.Fn = Fn;
  	    const wnaf = new curve_ts_1.wNAF(Point, Fn.BYTES * 8); // Fn.BITS?
  	    return Point;
  	}
  	/**
  	 * Base class for prime-order points like Ristretto255 and Decaf448.
  	 * These points eliminate cofactor issues by representing equivalence classes
  	 * of Edwards curve points.
  	 */
  	class PrimeEdwardsPoint {
  	    constructor(ep) {
  	        this.ep = ep;
  	    }
  	    // Static methods that must be implemented by subclasses
  	    static fromBytes(_bytes) {
  	        throw new Error('fromBytes must be implemented by subclass');
  	    }
  	    static fromHex(_hex) {
  	        throw new Error('fromHex must be implemented by subclass');
  	    }
  	    get x() {
  	        return this.toAffine().x;
  	    }
  	    get y() {
  	        return this.toAffine().y;
  	    }
  	    // Common implementations
  	    clearCofactor() {
  	        // no-op for prime-order groups
  	        return this;
  	    }
  	    assertValidity() {
  	        this.ep.assertValidity();
  	    }
  	    toAffine(invertedZ) {
  	        return this.ep.toAffine(invertedZ);
  	    }
  	    /** @deprecated use `toBytes` */
  	    toRawBytes() {
  	        return this.toBytes();
  	    }
  	    toHex() {
  	        return (0, utils_ts_1.bytesToHex)(this.toBytes());
  	    }
  	    toString() {
  	        return this.toHex();
  	    }
  	    isTorsionFree() {
  	        return true;
  	    }
  	    isSmallOrder() {
  	        return false;
  	    }
  	    add(other) {
  	        this.assertSame(other);
  	        return this.init(this.ep.add(other.ep));
  	    }
  	    subtract(other) {
  	        this.assertSame(other);
  	        return this.init(this.ep.subtract(other.ep));
  	    }
  	    multiply(scalar) {
  	        return this.init(this.ep.multiply(scalar));
  	    }
  	    multiplyUnsafe(scalar) {
  	        return this.init(this.ep.multiplyUnsafe(scalar));
  	    }
  	    double() {
  	        return this.init(this.ep.double());
  	    }
  	    negate() {
  	        return this.init(this.ep.negate());
  	    }
  	    precompute(windowSize, isLazy) {
  	        return this.init(this.ep.precompute(windowSize, isLazy));
  	    }
  	}
  	edwards.PrimeEdwardsPoint = PrimeEdwardsPoint;
  	/**
  	 * Initializes EdDSA signatures over given Edwards curve.
  	 */
  	function eddsa(Point, cHash, eddsaOpts) {
  	    if (typeof cHash !== 'function')
  	        throw new Error('"hash" function param is required');
  	    (0, utils_ts_1._validateObject)(eddsaOpts, {}, {
  	        adjustScalarBytes: 'function',
  	        randomBytes: 'function',
  	        domain: 'function',
  	        prehash: 'function',
  	        mapToCurve: 'function',
  	    });
  	    const { prehash } = eddsaOpts;
  	    const { BASE: G, Fp, Fn } = Point;
  	    const CURVE_ORDER = Fn.ORDER;
  	    const randomBytes_ = eddsaOpts.randomBytes || utils_ts_1.randomBytes;
  	    const adjustScalarBytes = eddsaOpts.adjustScalarBytes || ((bytes) => bytes); // NOOP
  	    const domain = eddsaOpts.domain ||
  	        ((data, ctx, phflag) => {
  	            (0, utils_ts_1.abool)('phflag', phflag);
  	            if (ctx.length || phflag)
  	                throw new Error('Contexts/pre-hash are not supported');
  	            return data;
  	        }); // NOOP
  	    function modN(a) {
  	        return Fn.create(a);
  	    }
  	    // Little-endian SHA512 with modulo n
  	    function modN_LE(hash) {
  	        // Not using Fn.fromBytes: hash can be 2*Fn.BYTES
  	        return modN((0, utils_ts_1.bytesToNumberLE)(hash));
  	    }
  	    // Get the hashed private scalar per RFC8032 5.1.5
  	    function getPrivateScalar(key) {
  	        const len = Fp.BYTES;
  	        key = (0, utils_ts_1.ensureBytes)('private key', key, len);
  	        // Hash private key with curve's hash function to produce uniformingly random input
  	        // Check byte lengths: ensure(64, h(ensure(32, key)))
  	        const hashed = (0, utils_ts_1.ensureBytes)('hashed private key', cHash(key), 2 * len);
  	        const head = adjustScalarBytes(hashed.slice(0, len)); // clear first half bits, produce FE
  	        const prefix = hashed.slice(len, 2 * len); // second half is called key prefix (5.1.6)
  	        const scalar = modN_LE(head); // The actual private scalar
  	        return { head, prefix, scalar };
  	    }
  	    /** Convenience method that creates public key from scalar. RFC8032 5.1.5 */
  	    function getExtendedPublicKey(secretKey) {
  	        const { head, prefix, scalar } = getPrivateScalar(secretKey);
  	        const point = G.multiply(scalar); // Point on Edwards curve aka public key
  	        const pointBytes = point.toBytes();
  	        return { head, prefix, scalar, point, pointBytes };
  	    }
  	    /** Calculates EdDSA pub key. RFC8032 5.1.5. */
  	    function getPublicKey(secretKey) {
  	        return getExtendedPublicKey(secretKey).pointBytes;
  	    }
  	    // int('LE', SHA512(dom2(F, C) || msgs)) mod N
  	    function hashDomainToScalar(context = Uint8Array.of(), ...msgs) {
  	        const msg = (0, utils_ts_1.concatBytes)(...msgs);
  	        return modN_LE(cHash(domain(msg, (0, utils_ts_1.ensureBytes)('context', context), !!prehash)));
  	    }
  	    /** Signs message with privateKey. RFC8032 5.1.6 */
  	    function sign(msg, secretKey, options = {}) {
  	        msg = (0, utils_ts_1.ensureBytes)('message', msg);
  	        if (prehash)
  	            msg = prehash(msg); // for ed25519ph etc.
  	        const { prefix, scalar, pointBytes } = getExtendedPublicKey(secretKey);
  	        const r = hashDomainToScalar(options.context, prefix, msg); // r = dom2(F, C) || prefix || PH(M)
  	        const R = G.multiply(r).toBytes(); // R = rG
  	        const k = hashDomainToScalar(options.context, R, pointBytes, msg); // R || A || PH(M)
  	        const s = modN(r + k * scalar); // S = (r + k * s) mod L
  	        (0, utils_ts_1.aInRange)('signature.s', s, _0n, CURVE_ORDER); // 0 <= s < l
  	        const L = Fp.BYTES;
  	        const res = (0, utils_ts_1.concatBytes)(R, (0, utils_ts_1.numberToBytesLE)(s, L));
  	        return (0, utils_ts_1.ensureBytes)('result', res, L * 2); // 64-byte signature
  	    }
  	    // verification rule is either zip215 or rfc8032 / nist186-5. Consult fromHex:
  	    const verifyOpts = { zip215: true };
  	    /**
  	     * Verifies EdDSA signature against message and public key. RFC8032 5.1.7.
  	     * An extended group equation is checked.
  	     */
  	    function verify(sig, msg, publicKey, options = verifyOpts) {
  	        const { context, zip215 } = options;
  	        const len = Fp.BYTES; // Verifies EdDSA signature against message and public key. RFC8032 5.1.7.
  	        sig = (0, utils_ts_1.ensureBytes)('signature', sig, 2 * len); // An extended group equation is checked.
  	        msg = (0, utils_ts_1.ensureBytes)('message', msg);
  	        publicKey = (0, utils_ts_1.ensureBytes)('publicKey', publicKey, len);
  	        if (zip215 !== undefined)
  	            (0, utils_ts_1.abool)('zip215', zip215);
  	        if (prehash)
  	            msg = prehash(msg); // for ed25519ph, etc
  	        const s = (0, utils_ts_1.bytesToNumberLE)(sig.slice(len, 2 * len));
  	        let A, R, SB;
  	        try {
  	            // zip215=true is good for consensus-critical apps. =false follows RFC8032 / NIST186-5.
  	            // zip215=true:  0 <= y < MASK (2^256 for ed25519)
  	            // zip215=false: 0 <= y < P (2^255-19 for ed25519)
  	            A = Point.fromHex(publicKey, zip215);
  	            R = Point.fromHex(sig.slice(0, len), zip215);
  	            SB = G.multiplyUnsafe(s); // 0 <= s < l is done inside
  	        }
  	        catch (error) {
  	            return false;
  	        }
  	        if (!zip215 && A.isSmallOrder())
  	            return false;
  	        const k = hashDomainToScalar(context, R.toBytes(), A.toBytes(), msg);
  	        const RkA = R.add(A.multiplyUnsafe(k));
  	        // Extended group equation
  	        // [8][S]B = [8]R + [8][k]A'
  	        return RkA.subtract(SB).clearCofactor().is0();
  	    }
  	    G.precompute(8); // Enable precomputes. Slows down first publicKey computation by 20ms.
  	    const size = Fp.BYTES;
  	    const lengths = {
  	        secret: size,
  	        public: size,
  	        signature: 2 * size,
  	        seed: size,
  	    };
  	    function randomSecretKey(seed = randomBytes_(lengths.seed)) {
  	        return seed;
  	    }
  	    const utils = {
  	        getExtendedPublicKey,
  	        /** ed25519 priv keys are uniform 32b. No need to check for modulo bias, like in secp256k1. */
  	        randomSecretKey,
  	        isValidSecretKey,
  	        isValidPublicKey,
  	        randomPrivateKey: randomSecretKey,
  	        /**
  	         * Converts ed public key to x public key. Uses formula:
  	         * - ed25519:
  	         *   - `(u, v) = ((1+y)/(1-y), sqrt(-486664)*u/x)`
  	         *   - `(x, y) = (sqrt(-486664)*u/v, (u-1)/(u+1))`
  	         * - ed448:
  	         *   - `(u, v) = ((y-1)/(y+1), sqrt(156324)*u/x)`
  	         *   - `(x, y) = (sqrt(156324)*u/v, (1+u)/(1-u))`
  	         *
  	         * There is NO `fromMontgomery`:
  	         * - There are 2 valid ed25519 points for every x25519, with flipped coordinate
  	         * - Sometimes there are 0 valid ed25519 points, because x25519 *additionally*
  	         *   accepts inputs on the quadratic twist, which can't be moved to ed25519
  	         */
  	        toMontgomery(publicKey) {
  	            const { y } = Point.fromBytes(publicKey);
  	            const is25519 = size === 32;
  	            if (!is25519 && size !== 57)
  	                throw new Error('only defined for 25519 and 448');
  	            const u = is25519 ? Fp.div(_1n + y, _1n - y) : Fp.div(y - _1n, y + _1n);
  	            return Fp.toBytes(u);
  	        },
  	        toMontgomeryPriv(privateKey) {
  	            (0, utils_ts_1.abytes)(privateKey, size);
  	            const hashed = cHash(privateKey.subarray(0, size));
  	            return adjustScalarBytes(hashed).subarray(0, size);
  	        },
  	        /**
  	         * We're doing scalar multiplication (used in getPublicKey etc) with precomputed BASE_POINT
  	         * values. This slows down first getPublicKey() by milliseconds (see Speed section),
  	         * but allows to speed-up subsequent getPublicKey() calls up to 20x.
  	         * @param windowSize 2, 4, 8, 16
  	         */
  	        precompute(windowSize = 8, point = Point.BASE) {
  	            return point.precompute(windowSize, false);
  	        },
  	    };
  	    function keygen(seed) {
  	        const secretKey = utils.randomSecretKey(seed);
  	        return { secretKey, publicKey: getPublicKey(secretKey) };
  	    }
  	    function isValidSecretKey(key) {
  	        try {
  	            return !!Fn.fromBytes(key, false);
  	        }
  	        catch (error) {
  	            return false;
  	        }
  	    }
  	    function isValidPublicKey(key, zip215) {
  	        try {
  	            return !!Point.fromBytes(key, zip215);
  	        }
  	        catch (error) {
  	            return false;
  	        }
  	    }
  	    return Object.freeze({
  	        keygen,
  	        getPublicKey,
  	        sign,
  	        verify,
  	        utils,
  	        Point,
  	        info: { type: 'edwards', lengths },
  	    });
  	}
  	// TODO: remove
  	function _eddsa_legacy_opts_to_new(c) {
  	    const CURVE = {
  	        a: c.a,
  	        d: c.d,
  	        p: c.Fp.ORDER,
  	        n: c.n,
  	        h: c.h,
  	        Gx: c.Gx,
  	        Gy: c.Gy,
  	    };
  	    const Fp = c.Fp;
  	    const Fn = (0, modular_ts_1.Field)(CURVE.n, c.nBitLength, true);
  	    const curveOpts = { Fp, Fn, uvRatio: c.uvRatio };
  	    const eddsaOpts = {
  	        randomBytes: c.randomBytes,
  	        adjustScalarBytes: c.adjustScalarBytes,
  	        domain: c.domain,
  	        prehash: c.prehash,
  	        mapToCurve: c.mapToCurve,
  	    };
  	    return { CURVE, curveOpts, hash: c.hash, eddsaOpts };
  	}
  	// TODO: remove
  	function _eddsa_new_output_to_legacy(c, eddsa) {
  	    const legacy = Object.assign({}, eddsa, { ExtendedPoint: eddsa.Point, CURVE: c });
  	    return legacy;
  	}
  	// TODO: remove. Use eddsa
  	function twistedEdwards(c) {
  	    const { CURVE, curveOpts, hash, eddsaOpts } = _eddsa_legacy_opts_to_new(c);
  	    const Point = edwards$1(CURVE, curveOpts);
  	    const EDDSA = eddsa(Point, hash, eddsaOpts);
  	    return _eddsa_new_output_to_legacy(c, EDDSA);
  	}
  	
  	return edwards;
  }

  var hashToCurve = {};

  var hasRequiredHashToCurve;

  function requireHashToCurve () {
  	if (hasRequiredHashToCurve) return hashToCurve;
  	hasRequiredHashToCurve = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports._DST_scalar = void 0;
  		exports.expand_message_xmd = expand_message_xmd;
  		exports.expand_message_xof = expand_message_xof;
  		exports.hash_to_field = hash_to_field;
  		exports.isogenyMap = isogenyMap;
  		exports.createHasher = createHasher;
  		const utils_ts_1 = /*@__PURE__*/ requireUtils$1();
  		const modular_ts_1 = /*@__PURE__*/ requireModular();
  		// Octet Stream to Integer. "spec" implementation of os2ip is 2.5x slower vs bytesToNumberBE.
  		const os2ip = utils_ts_1.bytesToNumberBE;
  		// Integer to Octet Stream (numberToBytesBE)
  		function i2osp(value, length) {
  		    anum(value);
  		    anum(length);
  		    if (value < 0 || value >= 1 << (8 * length))
  		        throw new Error('invalid I2OSP input: ' + value);
  		    const res = Array.from({ length }).fill(0);
  		    for (let i = length - 1; i >= 0; i--) {
  		        res[i] = value & 0xff;
  		        value >>>= 8;
  		    }
  		    return new Uint8Array(res);
  		}
  		function strxor(a, b) {
  		    const arr = new Uint8Array(a.length);
  		    for (let i = 0; i < a.length; i++) {
  		        arr[i] = a[i] ^ b[i];
  		    }
  		    return arr;
  		}
  		function anum(item) {
  		    if (!Number.isSafeInteger(item))
  		        throw new Error('number expected');
  		}
  		function normDST(DST) {
  		    if (!(0, utils_ts_1.isBytes)(DST) && typeof DST !== 'string')
  		        throw new Error('DST must be Uint8Array or string');
  		    return typeof DST === 'string' ? (0, utils_ts_1.utf8ToBytes)(DST) : DST;
  		}
  		/**
  		 * Produces a uniformly random byte string using a cryptographic hash function H that outputs b bits.
  		 * [RFC 9380 5.3.1](https://www.rfc-editor.org/rfc/rfc9380#section-5.3.1).
  		 */
  		function expand_message_xmd(msg, DST, lenInBytes, H) {
  		    (0, utils_ts_1.abytes)(msg);
  		    anum(lenInBytes);
  		    DST = normDST(DST);
  		    // https://www.rfc-editor.org/rfc/rfc9380#section-5.3.3
  		    if (DST.length > 255)
  		        DST = H((0, utils_ts_1.concatBytes)((0, utils_ts_1.utf8ToBytes)('H2C-OVERSIZE-DST-'), DST));
  		    const { outputLen: b_in_bytes, blockLen: r_in_bytes } = H;
  		    const ell = Math.ceil(lenInBytes / b_in_bytes);
  		    if (lenInBytes > 65535 || ell > 255)
  		        throw new Error('expand_message_xmd: invalid lenInBytes');
  		    const DST_prime = (0, utils_ts_1.concatBytes)(DST, i2osp(DST.length, 1));
  		    const Z_pad = i2osp(0, r_in_bytes);
  		    const l_i_b_str = i2osp(lenInBytes, 2); // len_in_bytes_str
  		    const b = new Array(ell);
  		    const b_0 = H((0, utils_ts_1.concatBytes)(Z_pad, msg, l_i_b_str, i2osp(0, 1), DST_prime));
  		    b[0] = H((0, utils_ts_1.concatBytes)(b_0, i2osp(1, 1), DST_prime));
  		    for (let i = 1; i <= ell; i++) {
  		        const args = [strxor(b_0, b[i - 1]), i2osp(i + 1, 1), DST_prime];
  		        b[i] = H((0, utils_ts_1.concatBytes)(...args));
  		    }
  		    const pseudo_random_bytes = (0, utils_ts_1.concatBytes)(...b);
  		    return pseudo_random_bytes.slice(0, lenInBytes);
  		}
  		/**
  		 * Produces a uniformly random byte string using an extendable-output function (XOF) H.
  		 * 1. The collision resistance of H MUST be at least k bits.
  		 * 2. H MUST be an XOF that has been proved indifferentiable from
  		 *    a random oracle under a reasonable cryptographic assumption.
  		 * [RFC 9380 5.3.2](https://www.rfc-editor.org/rfc/rfc9380#section-5.3.2).
  		 */
  		function expand_message_xof(msg, DST, lenInBytes, k, H) {
  		    (0, utils_ts_1.abytes)(msg);
  		    anum(lenInBytes);
  		    DST = normDST(DST);
  		    // https://www.rfc-editor.org/rfc/rfc9380#section-5.3.3
  		    // DST = H('H2C-OVERSIZE-DST-' || a_very_long_DST, Math.ceil((lenInBytes * k) / 8));
  		    if (DST.length > 255) {
  		        const dkLen = Math.ceil((2 * k) / 8);
  		        DST = H.create({ dkLen }).update((0, utils_ts_1.utf8ToBytes)('H2C-OVERSIZE-DST-')).update(DST).digest();
  		    }
  		    if (lenInBytes > 65535 || DST.length > 255)
  		        throw new Error('expand_message_xof: invalid lenInBytes');
  		    return (H.create({ dkLen: lenInBytes })
  		        .update(msg)
  		        .update(i2osp(lenInBytes, 2))
  		        // 2. DST_prime = DST || I2OSP(len(DST), 1)
  		        .update(DST)
  		        .update(i2osp(DST.length, 1))
  		        .digest());
  		}
  		/**
  		 * Hashes arbitrary-length byte strings to a list of one or more elements of a finite field F.
  		 * [RFC 9380 5.2](https://www.rfc-editor.org/rfc/rfc9380#section-5.2).
  		 * @param msg a byte string containing the message to hash
  		 * @param count the number of elements of F to output
  		 * @param options `{DST: string, p: bigint, m: number, k: number, expand: 'xmd' | 'xof', hash: H}`, see above
  		 * @returns [u_0, ..., u_(count - 1)], a list of field elements.
  		 */
  		function hash_to_field(msg, count, options) {
  		    (0, utils_ts_1._validateObject)(options, {
  		        p: 'bigint',
  		        m: 'number',
  		        k: 'number',
  		        hash: 'function',
  		    });
  		    const { p, k, m, hash, expand, DST } = options;
  		    if (!(0, utils_ts_1.isHash)(options.hash))
  		        throw new Error('expected valid hash');
  		    (0, utils_ts_1.abytes)(msg);
  		    anum(count);
  		    const log2p = p.toString(2).length;
  		    const L = Math.ceil((log2p + k) / 8); // section 5.1 of ietf draft link above
  		    const len_in_bytes = count * m * L;
  		    let prb; // pseudo_random_bytes
  		    if (expand === 'xmd') {
  		        prb = expand_message_xmd(msg, DST, len_in_bytes, hash);
  		    }
  		    else if (expand === 'xof') {
  		        prb = expand_message_xof(msg, DST, len_in_bytes, k, hash);
  		    }
  		    else if (expand === '_internal_pass') {
  		        // for internal tests only
  		        prb = msg;
  		    }
  		    else {
  		        throw new Error('expand must be "xmd" or "xof"');
  		    }
  		    const u = new Array(count);
  		    for (let i = 0; i < count; i++) {
  		        const e = new Array(m);
  		        for (let j = 0; j < m; j++) {
  		            const elm_offset = L * (j + i * m);
  		            const tv = prb.subarray(elm_offset, elm_offset + L);
  		            e[j] = (0, modular_ts_1.mod)(os2ip(tv), p);
  		        }
  		        u[i] = e;
  		    }
  		    return u;
  		}
  		function isogenyMap(field, map) {
  		    // Make same order as in spec
  		    const coeff = map.map((i) => Array.from(i).reverse());
  		    return (x, y) => {
  		        const [xn, xd, yn, yd] = coeff.map((val) => val.reduce((acc, i) => field.add(field.mul(acc, x), i)));
  		        // 6.6.3
  		        // Exceptional cases of iso_map are inputs that cause the denominator of
  		        // either rational function to evaluate to zero; such cases MUST return
  		        // the identity point on E.
  		        const [xd_inv, yd_inv] = (0, modular_ts_1.FpInvertBatch)(field, [xd, yd], true);
  		        x = field.mul(xn, xd_inv); // xNum / xDen
  		        y = field.mul(y, field.mul(yn, yd_inv)); // y * (yNum / yDev)
  		        return { x, y };
  		    };
  		}
  		exports._DST_scalar = (0, utils_ts_1.utf8ToBytes)('HashToScalar-');
  		/** Creates hash-to-curve methods from EC Point and mapToCurve function. See {@link H2CHasher}. */
  		function createHasher(Point, mapToCurve, defaults) {
  		    if (typeof mapToCurve !== 'function')
  		        throw new Error('mapToCurve() must be defined');
  		    function map(num) {
  		        return Point.fromAffine(mapToCurve(num));
  		    }
  		    function clear(initial) {
  		        const P = initial.clearCofactor();
  		        if (P.equals(Point.ZERO))
  		            return Point.ZERO; // zero will throw in assert
  		        P.assertValidity();
  		        return P;
  		    }
  		    return {
  		        defaults,
  		        hashToCurve(msg, options) {
  		            const opts = Object.assign({}, defaults, options);
  		            const u = hash_to_field(msg, 2, opts);
  		            const u0 = map(u[0]);
  		            const u1 = map(u[1]);
  		            return clear(u0.add(u1));
  		        },
  		        encodeToCurve(msg, options) {
  		            const optsDst = defaults.encodeDST ? { DST: defaults.encodeDST } : {};
  		            const opts = Object.assign({}, defaults, optsDst, options);
  		            const u = hash_to_field(msg, 1, opts);
  		            const u0 = map(u[0]);
  		            return clear(u0);
  		        },
  		        /** See {@link H2CHasher} */
  		        mapToCurve(scalars) {
  		            if (!Array.isArray(scalars))
  		                throw new Error('expected array of bigints');
  		            for (const i of scalars)
  		                if (typeof i !== 'bigint')
  		                    throw new Error('expected array of bigints');
  		            return clear(map(scalars));
  		        },
  		        // hash_to_scalar can produce 0: https://www.rfc-editor.org/errata/eid8393
  		        // RFC 9380, draft-irtf-cfrg-bbs-signatures-08
  		        hashToScalar(msg, options) {
  		            // @ts-ignore
  		            const N = Point.Fn.ORDER;
  		            const opts = Object.assign({}, defaults, { p: N, m: 1, DST: exports._DST_scalar }, options);
  		            return hash_to_field(msg, 1, opts)[0][0];
  		        },
  		    };
  		}
  		
  	} (hashToCurve));
  	return hashToCurve;
  }

  var montgomery = {};

  var hasRequiredMontgomery;

  function requireMontgomery () {
  	if (hasRequiredMontgomery) return montgomery;
  	hasRequiredMontgomery = 1;
  	Object.defineProperty(montgomery, "__esModule", { value: true });
  	montgomery.montgomery = montgomery$1;
  	/**
  	 * Montgomery curve methods. It's not really whole montgomery curve,
  	 * just bunch of very specific methods for X25519 / X448 from
  	 * [RFC 7748](https://www.rfc-editor.org/rfc/rfc7748)
  	 * @module
  	 */
  	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$1();
  	const modular_ts_1 = /*@__PURE__*/ requireModular();
  	const _0n = BigInt(0);
  	const _1n = BigInt(1);
  	const _2n = BigInt(2);
  	function validateOpts(curve) {
  	    (0, utils_ts_1._validateObject)(curve, {
  	        adjustScalarBytes: 'function',
  	        powPminus2: 'function',
  	    });
  	    return Object.freeze({ ...curve });
  	}
  	function montgomery$1(curveDef) {
  	    const CURVE = validateOpts(curveDef);
  	    const { P, type, adjustScalarBytes, powPminus2, randomBytes: rand } = CURVE;
  	    const is25519 = type === 'x25519';
  	    if (!is25519 && type !== 'x448')
  	        throw new Error('invalid type');
  	    const randomBytes_ = rand || utils_ts_1.randomBytes;
  	    const montgomeryBits = is25519 ? 255 : 448;
  	    const fieldLen = is25519 ? 32 : 56;
  	    const Gu = is25519 ? BigInt(9) : BigInt(5);
  	    // RFC 7748 #5:
  	    // The constant a24 is (486662 - 2) / 4 = 121665 for curve25519/X25519 and
  	    // (156326 - 2) / 4 = 39081 for curve448/X448
  	    // const a = is25519 ? 156326n : 486662n;
  	    const a24 = is25519 ? BigInt(121665) : BigInt(39081);
  	    // RFC: x25519 "the resulting integer is of the form 2^254 plus
  	    // eight times a value between 0 and 2^251 - 1 (inclusive)"
  	    // x448: "2^447 plus four times a value between 0 and 2^445 - 1 (inclusive)"
  	    const minScalar = is25519 ? _2n ** BigInt(254) : _2n ** BigInt(447);
  	    const maxAdded = is25519
  	        ? BigInt(8) * _2n ** BigInt(251) - _1n
  	        : BigInt(4) * _2n ** BigInt(445) - _1n;
  	    const maxScalar = minScalar + maxAdded + _1n; // (inclusive)
  	    const modP = (n) => (0, modular_ts_1.mod)(n, P);
  	    const GuBytes = encodeU(Gu);
  	    function encodeU(u) {
  	        return (0, utils_ts_1.numberToBytesLE)(modP(u), fieldLen);
  	    }
  	    function decodeU(u) {
  	        const _u = (0, utils_ts_1.ensureBytes)('u coordinate', u, fieldLen);
  	        // RFC: When receiving such an array, implementations of X25519
  	        // (but not X448) MUST mask the most significant bit in the final byte.
  	        if (is25519)
  	            _u[31] &= 127; // 0b0111_1111
  	        // RFC: Implementations MUST accept non-canonical values and process them as
  	        // if they had been reduced modulo the field prime.  The non-canonical
  	        // values are 2^255 - 19 through 2^255 - 1 for X25519 and 2^448 - 2^224
  	        // - 1 through 2^448 - 1 for X448.
  	        return modP((0, utils_ts_1.bytesToNumberLE)(_u));
  	    }
  	    function decodeScalar(scalar) {
  	        return (0, utils_ts_1.bytesToNumberLE)(adjustScalarBytes((0, utils_ts_1.ensureBytes)('scalar', scalar, fieldLen)));
  	    }
  	    function scalarMult(scalar, u) {
  	        const pu = montgomeryLadder(decodeU(u), decodeScalar(scalar));
  	        // Some public keys are useless, of low-order. Curve author doesn't think
  	        // it needs to be validated, but we do it nonetheless.
  	        // https://cr.yp.to/ecdh.html#validate
  	        if (pu === _0n)
  	            throw new Error('invalid private or public key received');
  	        return encodeU(pu);
  	    }
  	    // Computes public key from private. By doing scalar multiplication of base point.
  	    function scalarMultBase(scalar) {
  	        return scalarMult(scalar, GuBytes);
  	    }
  	    // cswap from RFC7748 "example code"
  	    function cswap(swap, x_2, x_3) {
  	        // dummy = mask(swap) AND (x_2 XOR x_3)
  	        // Where mask(swap) is the all-1 or all-0 word of the same length as x_2
  	        // and x_3, computed, e.g., as mask(swap) = 0 - swap.
  	        const dummy = modP(swap * (x_2 - x_3));
  	        x_2 = modP(x_2 - dummy); // x_2 = x_2 XOR dummy
  	        x_3 = modP(x_3 + dummy); // x_3 = x_3 XOR dummy
  	        return { x_2, x_3 };
  	    }
  	    /**
  	     * Montgomery x-only multiplication ladder.
  	     * @param pointU u coordinate (x) on Montgomery Curve 25519
  	     * @param scalar by which the point would be multiplied
  	     * @returns new Point on Montgomery curve
  	     */
  	    function montgomeryLadder(u, scalar) {
  	        (0, utils_ts_1.aInRange)('u', u, _0n, P);
  	        (0, utils_ts_1.aInRange)('scalar', scalar, minScalar, maxScalar);
  	        const k = scalar;
  	        const x_1 = u;
  	        let x_2 = _1n;
  	        let z_2 = _0n;
  	        let x_3 = u;
  	        let z_3 = _1n;
  	        let swap = _0n;
  	        for (let t = BigInt(montgomeryBits - 1); t >= _0n; t--) {
  	            const k_t = (k >> t) & _1n;
  	            swap ^= k_t;
  	            ({ x_2, x_3 } = cswap(swap, x_2, x_3));
  	            ({ x_2: z_2, x_3: z_3 } = cswap(swap, z_2, z_3));
  	            swap = k_t;
  	            const A = x_2 + z_2;
  	            const AA = modP(A * A);
  	            const B = x_2 - z_2;
  	            const BB = modP(B * B);
  	            const E = AA - BB;
  	            const C = x_3 + z_3;
  	            const D = x_3 - z_3;
  	            const DA = modP(D * A);
  	            const CB = modP(C * B);
  	            const dacb = DA + CB;
  	            const da_cb = DA - CB;
  	            x_3 = modP(dacb * dacb);
  	            z_3 = modP(x_1 * modP(da_cb * da_cb));
  	            x_2 = modP(AA * BB);
  	            z_2 = modP(E * (AA + modP(a24 * E)));
  	        }
  	        ({ x_2, x_3 } = cswap(swap, x_2, x_3));
  	        ({ x_2: z_2, x_3: z_3 } = cswap(swap, z_2, z_3));
  	        const z2 = powPminus2(z_2); // `Fp.pow(x, P - _2n)` is much slower equivalent
  	        return modP(x_2 * z2); // Return x_2 * (z_2^(p - 2))
  	    }
  	    const randomSecretKey = (seed = randomBytes_(fieldLen)) => seed;
  	    const utils = {
  	        randomSecretKey,
  	        randomPrivateKey: randomSecretKey,
  	    };
  	    function keygen(seed) {
  	        const secretKey = utils.randomSecretKey(seed);
  	        return { secretKey, publicKey: scalarMultBase(secretKey) };
  	    }
  	    const lengths = {
  	        secret: fieldLen,
  	        public: fieldLen,
  	        seed: fieldLen,
  	    };
  	    return {
  	        keygen,
  	        getSharedSecret: (secretKey, publicKey) => scalarMult(secretKey, publicKey),
  	        getPublicKey: (secretKey) => scalarMultBase(secretKey),
  	        scalarMult,
  	        scalarMultBase,
  	        utils,
  	        GuBytes: GuBytes.slice(),
  	        info: { type: 'montgomery', lengths },
  	    };
  	}
  	
  	return montgomery;
  }

  var hasRequiredEd25519;

  function requireEd25519 () {
  	if (hasRequiredEd25519) return ed25519;
  	hasRequiredEd25519 = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.ED25519_TORSION_SUBGROUP = exports.hash_to_ristretto255 = exports.hashToRistretto255 = exports.encodeToCurve = exports.hashToCurve = exports.ristretto255_hasher = exports.ristretto255 = exports.RistrettoPoint = exports.ed25519_hasher = exports.edwardsToMontgomery = exports.x25519 = exports.ed25519ph = exports.ed25519ctx = exports.ed25519 = void 0;
  		exports.edwardsToMontgomeryPub = edwardsToMontgomeryPub;
  		exports.edwardsToMontgomeryPriv = edwardsToMontgomeryPriv;
  		/**
  		 * ed25519 Twisted Edwards curve with following addons:
  		 * - X25519 ECDH
  		 * - Ristretto cofactor elimination
  		 * - Elligator hash-to-group / point indistinguishability
  		 * @module
  		 */
  		/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  		const sha2_js_1 = /*@__PURE__*/ requireSha2();
  		const utils_js_1 = /*@__PURE__*/ requireUtils$2();
  		const curve_ts_1 = /*@__PURE__*/ requireCurve();
  		const edwards_ts_1 = /*@__PURE__*/ requireEdwards();
  		const hash_to_curve_ts_1 = /*@__PURE__*/ requireHashToCurve();
  		const modular_ts_1 = /*@__PURE__*/ requireModular();
  		const montgomery_ts_1 = /*@__PURE__*/ requireMontgomery();
  		const utils_ts_1 = /*@__PURE__*/ requireUtils$1();
  		// prettier-ignore
  		const _0n = BigInt(0), _1n = BigInt(1), _2n = BigInt(2), _3n = BigInt(3);
  		// prettier-ignore
  		const _5n = BigInt(5), _8n = BigInt(8);
  		// P = 2n**255n - 19n
  		// N = 2n**252n + 27742317777372353535851937790883648493n
  		// a = Fp.create(BigInt(-1))
  		// d = -121665/121666 a.k.a. Fp.neg(121665 * Fp.inv(121666))
  		const ed25519_CURVE = {
  		    p: BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed'),
  		    n: BigInt('0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed'),
  		    h: _8n,
  		    a: BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec'),
  		    d: BigInt('0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3'),
  		    Gx: BigInt('0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a'),
  		    Gy: BigInt('0x6666666666666666666666666666666666666666666666666666666666666658'),
  		};
  		function ed25519_pow_2_252_3(x) {
  		    // prettier-ignore
  		    const _10n = BigInt(10), _20n = BigInt(20), _40n = BigInt(40), _80n = BigInt(80);
  		    const P = ed25519_CURVE.p;
  		    const x2 = (x * x) % P;
  		    const b2 = (x2 * x) % P; // x^3, 11
  		    const b4 = ((0, modular_ts_1.pow2)(b2, _2n, P) * b2) % P; // x^15, 1111
  		    const b5 = ((0, modular_ts_1.pow2)(b4, _1n, P) * x) % P; // x^31
  		    const b10 = ((0, modular_ts_1.pow2)(b5, _5n, P) * b5) % P;
  		    const b20 = ((0, modular_ts_1.pow2)(b10, _10n, P) * b10) % P;
  		    const b40 = ((0, modular_ts_1.pow2)(b20, _20n, P) * b20) % P;
  		    const b80 = ((0, modular_ts_1.pow2)(b40, _40n, P) * b40) % P;
  		    const b160 = ((0, modular_ts_1.pow2)(b80, _80n, P) * b80) % P;
  		    const b240 = ((0, modular_ts_1.pow2)(b160, _80n, P) * b80) % P;
  		    const b250 = ((0, modular_ts_1.pow2)(b240, _10n, P) * b10) % P;
  		    const pow_p_5_8 = ((0, modular_ts_1.pow2)(b250, _2n, P) * x) % P;
  		    // ^ To pow to (p+3)/8, multiply it by x.
  		    return { pow_p_5_8, b2 };
  		}
  		function adjustScalarBytes(bytes) {
  		    // Section 5: For X25519, in order to decode 32 random bytes as an integer scalar,
  		    // set the three least significant bits of the first byte
  		    bytes[0] &= 248; // 0b1111_1000
  		    // and the most significant bit of the last to zero,
  		    bytes[31] &= 127; // 0b0111_1111
  		    // set the second most significant bit of the last byte to 1
  		    bytes[31] |= 64; // 0b0100_0000
  		    return bytes;
  		}
  		// √(-1) aka √(a) aka 2^((p-1)/4)
  		// Fp.sqrt(Fp.neg(1))
  		const ED25519_SQRT_M1 = /* @__PURE__ */ BigInt('19681161376707505956807079304988542015446066515923890162744021073123829784752');
  		// sqrt(u/v)
  		function uvRatio(u, v) {
  		    const P = ed25519_CURVE.p;
  		    const v3 = (0, modular_ts_1.mod)(v * v * v, P); // v³
  		    const v7 = (0, modular_ts_1.mod)(v3 * v3 * v, P); // v⁷
  		    // (p+3)/8 and (p-5)/8
  		    const pow = ed25519_pow_2_252_3(u * v7).pow_p_5_8;
  		    let x = (0, modular_ts_1.mod)(u * v3 * pow, P); // (uv³)(uv⁷)^(p-5)/8
  		    const vx2 = (0, modular_ts_1.mod)(v * x * x, P); // vx²
  		    const root1 = x; // First root candidate
  		    const root2 = (0, modular_ts_1.mod)(x * ED25519_SQRT_M1, P); // Second root candidate
  		    const useRoot1 = vx2 === u; // If vx² = u (mod p), x is a square root
  		    const useRoot2 = vx2 === (0, modular_ts_1.mod)(-u, P); // If vx² = -u, set x <-- x * 2^((p-1)/4)
  		    const noRoot = vx2 === (0, modular_ts_1.mod)(-u * ED25519_SQRT_M1, P); // There is no valid root, vx² = -u√(-1)
  		    if (useRoot1)
  		        x = root1;
  		    if (useRoot2 || noRoot)
  		        x = root2; // We return root2 anyway, for const-time
  		    if ((0, modular_ts_1.isNegativeLE)(x, P))
  		        x = (0, modular_ts_1.mod)(-x, P);
  		    return { isValid: useRoot1 || useRoot2, value: x };
  		}
  		const Fp = /* @__PURE__ */ (() => (0, modular_ts_1.Field)(ed25519_CURVE.p, { isLE: true }))();
  		const Fn = /* @__PURE__ */ (() => (0, modular_ts_1.Field)(ed25519_CURVE.n, { isLE: true }))();
  		const ed25519Defaults = /* @__PURE__ */ (() => ({
  		    ...ed25519_CURVE,
  		    Fp,
  		    hash: sha2_js_1.sha512,
  		    adjustScalarBytes,
  		    // dom2
  		    // Ratio of u to v. Allows us to combine inversion and square root. Uses algo from RFC8032 5.1.3.
  		    // Constant-time, u/√v
  		    uvRatio,
  		}))();
  		/**
  		 * ed25519 curve with EdDSA signatures.
  		 * @example
  		 * import { ed25519 } from '@noble/curves/ed25519';
  		 * const { secretKey, publicKey } = ed25519.keygen();
  		 * const msg = new TextEncoder().encode('hello');
  		 * const sig = ed25519.sign(msg, priv);
  		 * ed25519.verify(sig, msg, pub); // Default mode: follows ZIP215
  		 * ed25519.verify(sig, msg, pub, { zip215: false }); // RFC8032 / FIPS 186-5
  		 */
  		exports.ed25519 = (() => (0, edwards_ts_1.twistedEdwards)(ed25519Defaults))();
  		function ed25519_domain(data, ctx, phflag) {
  		    if (ctx.length > 255)
  		        throw new Error('Context is too big');
  		    return (0, utils_js_1.concatBytes)((0, utils_js_1.utf8ToBytes)('SigEd25519 no Ed25519 collisions'), new Uint8Array([phflag ? 1 : 0, ctx.length]), ctx, data);
  		}
  		/** Context of ed25519. Uses context for domain separation. */
  		exports.ed25519ctx = (() => (0, edwards_ts_1.twistedEdwards)({
  		    ...ed25519Defaults,
  		    domain: ed25519_domain,
  		}))();
  		/** Prehashed version of ed25519. Accepts already-hashed messages in sign() and verify(). */
  		exports.ed25519ph = (() => (0, edwards_ts_1.twistedEdwards)(Object.assign({}, ed25519Defaults, {
  		    domain: ed25519_domain,
  		    prehash: sha2_js_1.sha512,
  		})))();
  		/**
  		 * ECDH using curve25519 aka x25519.
  		 * @example
  		 * import { x25519 } from '@noble/curves/ed25519';
  		 * const priv = 'a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4';
  		 * const pub = 'e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c';
  		 * x25519.getSharedSecret(priv, pub) === x25519.scalarMult(priv, pub); // aliases
  		 * x25519.getPublicKey(priv) === x25519.scalarMultBase(priv);
  		 * x25519.getPublicKey(x25519.utils.randomSecretKey());
  		 */
  		exports.x25519 = (() => {
  		    const P = ed25519_CURVE.p;
  		    return (0, montgomery_ts_1.montgomery)({
  		        P,
  		        type: 'x25519',
  		        powPminus2: (x) => {
  		            // x^(p-2) aka x^(2^255-21)
  		            const { pow_p_5_8, b2 } = ed25519_pow_2_252_3(x);
  		            return (0, modular_ts_1.mod)((0, modular_ts_1.pow2)(pow_p_5_8, _3n, P) * b2, P);
  		        },
  		        adjustScalarBytes,
  		    });
  		})();
  		/** @deprecated use `ed25519.utils.toMontgomery` */
  		function edwardsToMontgomeryPub(edwardsPub) {
  		    return exports.ed25519.utils.toMontgomery((0, utils_ts_1.ensureBytes)('pub', edwardsPub));
  		}
  		/** @deprecated use `ed25519.utils.toMontgomery` */
  		exports.edwardsToMontgomery = edwardsToMontgomeryPub;
  		/** @deprecated use `ed25519.utils.toMontgomeryPriv` */
  		function edwardsToMontgomeryPriv(edwardsPriv) {
  		    return exports.ed25519.utils.toMontgomeryPriv((0, utils_ts_1.ensureBytes)('pub', edwardsPriv));
  		}
  		// Hash To Curve Elligator2 Map (NOTE: different from ristretto255 elligator)
  		// NOTE: very important part is usage of FpSqrtEven for ELL2_C1_EDWARDS, since
  		// SageMath returns different root first and everything falls apart
  		const ELL2_C1 = /* @__PURE__ */ (() => (Fp.ORDER + _3n) / _8n)(); // 1. c1 = (q + 3) / 8       # Integer arithmetic
  		const ELL2_C2 = /* @__PURE__ */ (() => Fp.pow(_2n, ELL2_C1))(); // 2. c2 = 2^c1
  		const ELL2_C3 = /* @__PURE__ */ (() => Fp.sqrt(Fp.neg(Fp.ONE)))(); // 3. c3 = sqrt(-1)
  		// prettier-ignore
  		function map_to_curve_elligator2_curve25519(u) {
  		    const ELL2_C4 = (Fp.ORDER - _5n) / _8n; // 4. c4 = (q - 5) / 8       # Integer arithmetic
  		    const ELL2_J = BigInt(486662);
  		    let tv1 = Fp.sqr(u); //  1.  tv1 = u^2
  		    tv1 = Fp.mul(tv1, _2n); //  2.  tv1 = 2 * tv1
  		    let xd = Fp.add(tv1, Fp.ONE); //  3.   xd = tv1 + 1         # Nonzero: -1 is square (mod p), tv1 is not
  		    let x1n = Fp.neg(ELL2_J); //  4.  x1n = -J              # x1 = x1n / xd = -J / (1 + 2 * u^2)
  		    let tv2 = Fp.sqr(xd); //  5.  tv2 = xd^2
  		    let gxd = Fp.mul(tv2, xd); //  6.  gxd = tv2 * xd        # gxd = xd^3
  		    let gx1 = Fp.mul(tv1, ELL2_J); //  7.  gx1 = J * tv1         # x1n + J * xd
  		    gx1 = Fp.mul(gx1, x1n); //  8.  gx1 = gx1 * x1n       # x1n^2 + J * x1n * xd
  		    gx1 = Fp.add(gx1, tv2); //  9.  gx1 = gx1 + tv2       # x1n^2 + J * x1n * xd + xd^2
  		    gx1 = Fp.mul(gx1, x1n); //  10. gx1 = gx1 * x1n       # x1n^3 + J * x1n^2 * xd + x1n * xd^2
  		    let tv3 = Fp.sqr(gxd); //  11. tv3 = gxd^2
  		    tv2 = Fp.sqr(tv3); //  12. tv2 = tv3^2           # gxd^4
  		    tv3 = Fp.mul(tv3, gxd); //  13. tv3 = tv3 * gxd       # gxd^3
  		    tv3 = Fp.mul(tv3, gx1); //  14. tv3 = tv3 * gx1       # gx1 * gxd^3
  		    tv2 = Fp.mul(tv2, tv3); //  15. tv2 = tv2 * tv3       # gx1 * gxd^7
  		    let y11 = Fp.pow(tv2, ELL2_C4); //  16. y11 = tv2^c4        # (gx1 * gxd^7)^((p - 5) / 8)
  		    y11 = Fp.mul(y11, tv3); //  17. y11 = y11 * tv3       # gx1*gxd^3*(gx1*gxd^7)^((p-5)/8)
  		    let y12 = Fp.mul(y11, ELL2_C3); //  18. y12 = y11 * c3
  		    tv2 = Fp.sqr(y11); //  19. tv2 = y11^2
  		    tv2 = Fp.mul(tv2, gxd); //  20. tv2 = tv2 * gxd
  		    let e1 = Fp.eql(tv2, gx1); //  21.  e1 = tv2 == gx1
  		    let y1 = Fp.cmov(y12, y11, e1); //  22.  y1 = CMOV(y12, y11, e1)  # If g(x1) is square, this is its sqrt
  		    let x2n = Fp.mul(x1n, tv1); //  23. x2n = x1n * tv1       # x2 = x2n / xd = 2 * u^2 * x1n / xd
  		    let y21 = Fp.mul(y11, u); //  24. y21 = y11 * u
  		    y21 = Fp.mul(y21, ELL2_C2); //  25. y21 = y21 * c2
  		    let y22 = Fp.mul(y21, ELL2_C3); //  26. y22 = y21 * c3
  		    let gx2 = Fp.mul(gx1, tv1); //  27. gx2 = gx1 * tv1       # g(x2) = gx2 / gxd = 2 * u^2 * g(x1)
  		    tv2 = Fp.sqr(y21); //  28. tv2 = y21^2
  		    tv2 = Fp.mul(tv2, gxd); //  29. tv2 = tv2 * gxd
  		    let e2 = Fp.eql(tv2, gx2); //  30.  e2 = tv2 == gx2
  		    let y2 = Fp.cmov(y22, y21, e2); //  31.  y2 = CMOV(y22, y21, e2)  # If g(x2) is square, this is its sqrt
  		    tv2 = Fp.sqr(y1); //  32. tv2 = y1^2
  		    tv2 = Fp.mul(tv2, gxd); //  33. tv2 = tv2 * gxd
  		    let e3 = Fp.eql(tv2, gx1); //  34.  e3 = tv2 == gx1
  		    let xn = Fp.cmov(x2n, x1n, e3); //  35.  xn = CMOV(x2n, x1n, e3)  # If e3, x = x1, else x = x2
  		    let y = Fp.cmov(y2, y1, e3); //  36.   y = CMOV(y2, y1, e3)    # If e3, y = y1, else y = y2
  		    let e4 = Fp.isOdd(y); //  37.  e4 = sgn0(y) == 1        # Fix sign of y
  		    y = Fp.cmov(y, Fp.neg(y), e3 !== e4); //  38.   y = CMOV(y, -y, e3 XOR e4)
  		    return { xMn: xn, xMd: xd, yMn: y, yMd: _1n }; //  39. return (xn, xd, y, 1)
  		}
  		const ELL2_C1_EDWARDS = /* @__PURE__ */ (() => (0, modular_ts_1.FpSqrtEven)(Fp, Fp.neg(BigInt(486664))))(); // sgn0(c1) MUST equal 0
  		function map_to_curve_elligator2_edwards25519(u) {
  		    const { xMn, xMd, yMn, yMd } = map_to_curve_elligator2_curve25519(u); //  1.  (xMn, xMd, yMn, yMd) =
  		    // map_to_curve_elligator2_curve25519(u)
  		    let xn = Fp.mul(xMn, yMd); //  2.  xn = xMn * yMd
  		    xn = Fp.mul(xn, ELL2_C1_EDWARDS); //  3.  xn = xn * c1
  		    let xd = Fp.mul(xMd, yMn); //  4.  xd = xMd * yMn    # xn / xd = c1 * xM / yM
  		    let yn = Fp.sub(xMn, xMd); //  5.  yn = xMn - xMd
  		    let yd = Fp.add(xMn, xMd); //  6.  yd = xMn + xMd    # (n / d - 1) / (n / d + 1) = (n - d) / (n + d)
  		    let tv1 = Fp.mul(xd, yd); //  7. tv1 = xd * yd
  		    let e = Fp.eql(tv1, Fp.ZERO); //  8.   e = tv1 == 0
  		    xn = Fp.cmov(xn, Fp.ZERO, e); //  9.  xn = CMOV(xn, 0, e)
  		    xd = Fp.cmov(xd, Fp.ONE, e); //  10. xd = CMOV(xd, 1, e)
  		    yn = Fp.cmov(yn, Fp.ONE, e); //  11. yn = CMOV(yn, 1, e)
  		    yd = Fp.cmov(yd, Fp.ONE, e); //  12. yd = CMOV(yd, 1, e)
  		    const [xd_inv, yd_inv] = (0, modular_ts_1.FpInvertBatch)(Fp, [xd, yd], true); // batch division
  		    return { x: Fp.mul(xn, xd_inv), y: Fp.mul(yn, yd_inv) }; //  13. return (xn, xd, yn, yd)
  		}
  		/** Hashing to ed25519 points / field. RFC 9380 methods. */
  		exports.ed25519_hasher = (() => (0, hash_to_curve_ts_1.createHasher)(exports.ed25519.Point, (scalars) => map_to_curve_elligator2_edwards25519(scalars[0]), {
  		    DST: 'edwards25519_XMD:SHA-512_ELL2_RO_',
  		    encodeDST: 'edwards25519_XMD:SHA-512_ELL2_NU_',
  		    p: Fp.ORDER,
  		    m: 1,
  		    k: 128,
  		    expand: 'xmd',
  		    hash: sha2_js_1.sha512,
  		}))();
  		// √(-1) aka √(a) aka 2^((p-1)/4)
  		const SQRT_M1 = ED25519_SQRT_M1;
  		// √(ad - 1)
  		const SQRT_AD_MINUS_ONE = /* @__PURE__ */ BigInt('25063068953384623474111414158702152701244531502492656460079210482610430750235');
  		// 1 / √(a-d)
  		const INVSQRT_A_MINUS_D = /* @__PURE__ */ BigInt('54469307008909316920995813868745141605393597292927456921205312896311721017578');
  		// 1-d²
  		const ONE_MINUS_D_SQ = /* @__PURE__ */ BigInt('1159843021668779879193775521855586647937357759715417654439879720876111806838');
  		// (d-1)²
  		const D_MINUS_ONE_SQ = /* @__PURE__ */ BigInt('40440834346308536858101042469323190826248399146238708352240133220865137265952');
  		// Calculates 1/√(number)
  		const invertSqrt = (number) => uvRatio(_1n, number);
  		const MAX_255B = /* @__PURE__ */ BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  		const bytes255ToNumberLE = (bytes) => exports.ed25519.CURVE.Fp.create((0, utils_ts_1.bytesToNumberLE)(bytes) & MAX_255B);
  		/**
  		 * Computes Elligator map for Ristretto255.
  		 * Described in [RFC9380](https://www.rfc-editor.org/rfc/rfc9380#appendix-B) and on
  		 * the [website](https://ristretto.group/formulas/elligator.html).
  		 */
  		function calcElligatorRistrettoMap(r0) {
  		    const { d } = exports.ed25519.CURVE;
  		    const P = exports.ed25519.CURVE.Fp.ORDER;
  		    const mod = exports.ed25519.CURVE.Fp.create;
  		    const r = mod(SQRT_M1 * r0 * r0); // 1
  		    const Ns = mod((r + _1n) * ONE_MINUS_D_SQ); // 2
  		    let c = BigInt(-1); // 3
  		    const D = mod((c - d * r) * mod(r + d)); // 4
  		    let { isValid: Ns_D_is_sq, value: s } = uvRatio(Ns, D); // 5
  		    let s_ = mod(s * r0); // 6
  		    if (!(0, modular_ts_1.isNegativeLE)(s_, P))
  		        s_ = mod(-s_);
  		    if (!Ns_D_is_sq)
  		        s = s_; // 7
  		    if (!Ns_D_is_sq)
  		        c = r; // 8
  		    const Nt = mod(c * (r - _1n) * D_MINUS_ONE_SQ - D); // 9
  		    const s2 = s * s;
  		    const W0 = mod((s + s) * D); // 10
  		    const W1 = mod(Nt * SQRT_AD_MINUS_ONE); // 11
  		    const W2 = mod(_1n - s2); // 12
  		    const W3 = mod(_1n + s2); // 13
  		    return new exports.ed25519.Point(mod(W0 * W3), mod(W2 * W1), mod(W1 * W3), mod(W0 * W2));
  		}
  		function ristretto255_map(bytes) {
  		    (0, utils_js_1.abytes)(bytes, 64);
  		    const r1 = bytes255ToNumberLE(bytes.subarray(0, 32));
  		    const R1 = calcElligatorRistrettoMap(r1);
  		    const r2 = bytes255ToNumberLE(bytes.subarray(32, 64));
  		    const R2 = calcElligatorRistrettoMap(r2);
  		    return new _RistrettoPoint(R1.add(R2));
  		}
  		/**
  		 * Wrapper over Edwards Point for ristretto255.
  		 *
  		 * Each ed25519/ExtendedPoint has 8 different equivalent points. This can be
  		 * a source of bugs for protocols like ring signatures. Ristretto was created to solve this.
  		 * Ristretto point operates in X:Y:Z:T extended coordinates like ExtendedPoint,
  		 * but it should work in its own namespace: do not combine those two.
  		 * See [RFC9496](https://www.rfc-editor.org/rfc/rfc9496).
  		 */
  		class _RistrettoPoint extends edwards_ts_1.PrimeEdwardsPoint {
  		    constructor(ep) {
  		        super(ep);
  		    }
  		    static fromAffine(ap) {
  		        return new _RistrettoPoint(exports.ed25519.Point.fromAffine(ap));
  		    }
  		    assertSame(other) {
  		        if (!(other instanceof _RistrettoPoint))
  		            throw new Error('RistrettoPoint expected');
  		    }
  		    init(ep) {
  		        return new _RistrettoPoint(ep);
  		    }
  		    /** @deprecated use `import { ristretto255_hasher } from '@noble/curves/ed25519.js';` */
  		    static hashToCurve(hex) {
  		        return ristretto255_map((0, utils_ts_1.ensureBytes)('ristrettoHash', hex, 64));
  		    }
  		    static fromBytes(bytes) {
  		        (0, utils_js_1.abytes)(bytes, 32);
  		        const { a, d } = exports.ed25519.CURVE;
  		        const P = Fp.ORDER;
  		        const mod = Fp.create;
  		        const s = bytes255ToNumberLE(bytes);
  		        // 1. Check that s_bytes is the canonical encoding of a field element, or else abort.
  		        // 3. Check that s is non-negative, or else abort
  		        if (!(0, utils_ts_1.equalBytes)((0, utils_ts_1.numberToBytesLE)(s, 32), bytes) || (0, modular_ts_1.isNegativeLE)(s, P))
  		            throw new Error('invalid ristretto255 encoding 1');
  		        const s2 = mod(s * s);
  		        const u1 = mod(_1n + a * s2); // 4 (a is -1)
  		        const u2 = mod(_1n - a * s2); // 5
  		        const u1_2 = mod(u1 * u1);
  		        const u2_2 = mod(u2 * u2);
  		        const v = mod(a * d * u1_2 - u2_2); // 6
  		        const { isValid, value: I } = invertSqrt(mod(v * u2_2)); // 7
  		        const Dx = mod(I * u2); // 8
  		        const Dy = mod(I * Dx * v); // 9
  		        let x = mod((s + s) * Dx); // 10
  		        if ((0, modular_ts_1.isNegativeLE)(x, P))
  		            x = mod(-x); // 10
  		        const y = mod(u1 * Dy); // 11
  		        const t = mod(x * y); // 12
  		        if (!isValid || (0, modular_ts_1.isNegativeLE)(t, P) || y === _0n)
  		            throw new Error('invalid ristretto255 encoding 2');
  		        return new _RistrettoPoint(new exports.ed25519.Point(x, y, _1n, t));
  		    }
  		    /**
  		     * Converts ristretto-encoded string to ristretto point.
  		     * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
  		     * @param hex Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
  		     */
  		    static fromHex(hex) {
  		        return _RistrettoPoint.fromBytes((0, utils_ts_1.ensureBytes)('ristrettoHex', hex, 32));
  		    }
  		    static msm(points, scalars) {
  		        return (0, curve_ts_1.pippenger)(_RistrettoPoint, exports.ed25519.Point.Fn, points, scalars);
  		    }
  		    /**
  		     * Encodes ristretto point to Uint8Array.
  		     * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
  		     */
  		    toBytes() {
  		        let { X, Y, Z, T } = this.ep;
  		        const P = Fp.ORDER;
  		        const mod = Fp.create;
  		        const u1 = mod(mod(Z + Y) * mod(Z - Y)); // 1
  		        const u2 = mod(X * Y); // 2
  		        // Square root always exists
  		        const u2sq = mod(u2 * u2);
  		        const { value: invsqrt } = invertSqrt(mod(u1 * u2sq)); // 3
  		        const D1 = mod(invsqrt * u1); // 4
  		        const D2 = mod(invsqrt * u2); // 5
  		        const zInv = mod(D1 * D2 * T); // 6
  		        let D; // 7
  		        if ((0, modular_ts_1.isNegativeLE)(T * zInv, P)) {
  		            let _x = mod(Y * SQRT_M1);
  		            let _y = mod(X * SQRT_M1);
  		            X = _x;
  		            Y = _y;
  		            D = mod(D1 * INVSQRT_A_MINUS_D);
  		        }
  		        else {
  		            D = D2; // 8
  		        }
  		        if ((0, modular_ts_1.isNegativeLE)(X * zInv, P))
  		            Y = mod(-Y); // 9
  		        let s = mod((Z - Y) * D); // 10 (check footer's note, no sqrt(-a))
  		        if ((0, modular_ts_1.isNegativeLE)(s, P))
  		            s = mod(-s);
  		        return (0, utils_ts_1.numberToBytesLE)(s, 32); // 11
  		    }
  		    /**
  		     * Compares two Ristretto points.
  		     * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-equals).
  		     */
  		    equals(other) {
  		        this.assertSame(other);
  		        const { X: X1, Y: Y1 } = this.ep;
  		        const { X: X2, Y: Y2 } = other.ep;
  		        const mod = Fp.create;
  		        // (x1 * y2 == y1 * x2) | (y1 * y2 == x1 * x2)
  		        const one = mod(X1 * Y2) === mod(Y1 * X2);
  		        const two = mod(Y1 * Y2) === mod(X1 * X2);
  		        return one || two;
  		    }
  		    is0() {
  		        return this.equals(_RistrettoPoint.ZERO);
  		    }
  		}
  		// Do NOT change syntax: the following gymnastics is done,
  		// because typescript strips comments, which makes bundlers disable tree-shaking.
  		// prettier-ignore
  		_RistrettoPoint.BASE = 
  		/* @__PURE__ */ (() => new _RistrettoPoint(exports.ed25519.Point.BASE))();
  		// prettier-ignore
  		_RistrettoPoint.ZERO = 
  		/* @__PURE__ */ (() => new _RistrettoPoint(exports.ed25519.Point.ZERO))();
  		// prettier-ignore
  		_RistrettoPoint.Fp = 
  		 Fp;
  		// prettier-ignore
  		_RistrettoPoint.Fn = 
  		 Fn;
  		/** @deprecated use `ristretto255.Point` */
  		exports.RistrettoPoint = _RistrettoPoint;
  		exports.ristretto255 = { Point: _RistrettoPoint };
  		/** Hashing to ristretto255 points / field. RFC 9380 methods. */
  		exports.ristretto255_hasher = {
  		    hashToCurve(msg, options) {
  		        const DST = options?.DST || 'ristretto255_XMD:SHA-512_R255MAP_RO_';
  		        return ristretto255_map((0, hash_to_curve_ts_1.expand_message_xmd)(msg, DST, 64, sha2_js_1.sha512));
  		    },
  		    hashToScalar(msg, options = { DST: hash_to_curve_ts_1._DST_scalar }) {
  		        return Fn.create((0, utils_ts_1.bytesToNumberLE)((0, hash_to_curve_ts_1.expand_message_xmd)(msg, options.DST, 64, sha2_js_1.sha512)));
  		    },
  		};
  		// export const ristretto255_oprf: OPRF = createORPF({
  		//   name: 'ristretto255-SHA512',
  		//   Point: RistrettoPoint,
  		//   hash: sha512,
  		//   hashToGroup: ristretto255_hasher.hashToCurve,
  		//   hashToScalar: ristretto255_hasher.hashToScalar,
  		// });
  		/** @deprecated use `import { ed25519_hasher } from '@noble/curves/ed25519.js';` */
  		exports.hashToCurve = (() => exports.ed25519_hasher.hashToCurve)();
  		/** @deprecated use `import { ed25519_hasher } from '@noble/curves/ed25519.js';` */
  		exports.encodeToCurve = (() => exports.ed25519_hasher.encodeToCurve)();
  		/** @deprecated use `import { ristretto255_hasher } from '@noble/curves/ed25519.js';` */
  		exports.hashToRistretto255 = (() => exports.ristretto255_hasher.hashToCurve)();
  		/** @deprecated use `import { ristretto255_hasher } from '@noble/curves/ed25519.js';` */
  		exports.hash_to_ristretto255 = (() => exports.ristretto255_hasher.hashToCurve)();
  		/**
  		 * Weird / bogus points, useful for debugging.
  		 * All 8 ed25519 points of 8-torsion subgroup can be generated from the point
  		 * T = `26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05`.
  		 * ⟨T⟩ = { O, T, 2T, 3T, 4T, 5T, 6T, 7T }
  		 */
  		exports.ED25519_TORSION_SUBGROUP = [
  		    '0100000000000000000000000000000000000000000000000000000000000000',
  		    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  		    '0000000000000000000000000000000000000000000000000000000000000080',
  		    '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  		    'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  		    '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
  		    '0000000000000000000000000000000000000000000000000000000000000000',
  		    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
  		];
  		
  	} (ed25519));
  	return ed25519;
  }

  var secp256k1 = {};

  var _shortw_utils = {};

  var weierstrass = {};

  var hmac = {};

  var hasRequiredHmac;

  function requireHmac () {
  	if (hasRequiredHmac) return hmac;
  	hasRequiredHmac = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.hmac = exports.HMAC = void 0;
  		/**
  		 * HMAC: RFC2104 message authentication code.
  		 * @module
  		 */
  		const utils_ts_1 = /*@__PURE__*/ requireUtils$2();
  		class HMAC extends utils_ts_1.Hash {
  		    constructor(hash, _key) {
  		        super();
  		        this.finished = false;
  		        this.destroyed = false;
  		        (0, utils_ts_1.ahash)(hash);
  		        const key = (0, utils_ts_1.toBytes)(_key);
  		        this.iHash = hash.create();
  		        if (typeof this.iHash.update !== 'function')
  		            throw new Error('Expected instance of class which extends utils.Hash');
  		        this.blockLen = this.iHash.blockLen;
  		        this.outputLen = this.iHash.outputLen;
  		        const blockLen = this.blockLen;
  		        const pad = new Uint8Array(blockLen);
  		        // blockLen can be bigger than outputLen
  		        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
  		        for (let i = 0; i < pad.length; i++)
  		            pad[i] ^= 0x36;
  		        this.iHash.update(pad);
  		        // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
  		        this.oHash = hash.create();
  		        // Undo internal XOR && apply outer XOR
  		        for (let i = 0; i < pad.length; i++)
  		            pad[i] ^= 0x36 ^ 0x5c;
  		        this.oHash.update(pad);
  		        (0, utils_ts_1.clean)(pad);
  		    }
  		    update(buf) {
  		        (0, utils_ts_1.aexists)(this);
  		        this.iHash.update(buf);
  		        return this;
  		    }
  		    digestInto(out) {
  		        (0, utils_ts_1.aexists)(this);
  		        (0, utils_ts_1.abytes)(out, this.outputLen);
  		        this.finished = true;
  		        this.iHash.digestInto(out);
  		        this.oHash.update(out);
  		        this.oHash.digestInto(out);
  		        this.destroy();
  		    }
  		    digest() {
  		        const out = new Uint8Array(this.oHash.outputLen);
  		        this.digestInto(out);
  		        return out;
  		    }
  		    _cloneInto(to) {
  		        // Create new instance without calling constructor since key already in state and we don't know it.
  		        to || (to = Object.create(Object.getPrototypeOf(this), {}));
  		        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
  		        to = to;
  		        to.finished = finished;
  		        to.destroyed = destroyed;
  		        to.blockLen = blockLen;
  		        to.outputLen = outputLen;
  		        to.oHash = oHash._cloneInto(to.oHash);
  		        to.iHash = iHash._cloneInto(to.iHash);
  		        return to;
  		    }
  		    clone() {
  		        return this._cloneInto();
  		    }
  		    destroy() {
  		        this.destroyed = true;
  		        this.oHash.destroy();
  		        this.iHash.destroy();
  		    }
  		}
  		exports.HMAC = HMAC;
  		/**
  		 * HMAC: RFC2104 message authentication code.
  		 * @param hash - function that would be used e.g. sha256
  		 * @param key - message key
  		 * @param message - message data
  		 * @example
  		 * import { hmac } from '@noble/hashes/hmac';
  		 * import { sha256 } from '@noble/hashes/sha2';
  		 * const mac1 = hmac(sha256, 'key', 'message');
  		 */
  		const hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
  		exports.hmac = hmac;
  		exports.hmac.create = (hash, key) => new HMAC(hash, key);
  		
  	} (hmac));
  	return hmac;
  }

  var hasRequiredWeierstrass;

  function requireWeierstrass () {
  	if (hasRequiredWeierstrass) return weierstrass;
  	hasRequiredWeierstrass = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.DER = exports.DERErr = void 0;
  		exports._splitEndoScalar = _splitEndoScalar;
  		exports._legacyHelperEquat = _legacyHelperEquat;
  		exports._normFnElement = _normFnElement;
  		exports.weierstrassN = weierstrassN;
  		exports.weierstrassPoints = weierstrassPoints;
  		exports.SWUFpSqrtRatio = SWUFpSqrtRatio;
  		exports.mapToCurveSimpleSWU = mapToCurveSimpleSWU;
  		exports.ecdsa = ecdsa;
  		exports.weierstrass = weierstrass;
  		/**
  		 * Short Weierstrass curve methods. The formula is: y² = x³ + ax + b.
  		 *
  		 * ### Design rationale for types
  		 *
  		 * * Interaction between classes from different curves should fail:
  		 *   `k256.Point.BASE.add(p256.Point.BASE)`
  		 * * For this purpose we want to use `instanceof` operator, which is fast and works during runtime
  		 * * Different calls of `curve()` would return different classes -
  		 *   `curve(params) !== curve(params)`: if somebody decided to monkey-patch their curve,
  		 *   it won't affect others
  		 *
  		 * TypeScript can't infer types for classes created inside a function. Classes is one instance
  		 * of nominative types in TypeScript and interfaces only check for shape, so it's hard to create
  		 * unique type for every function call.
  		 *
  		 * We can use generic types via some param, like curve opts, but that would:
  		 *     1. Enable interaction between `curve(params)` and `curve(params)` (curves of same params)
  		 *     which is hard to debug.
  		 *     2. Params can be generic and we can't enforce them to be constant value:
  		 *     if somebody creates curve from non-constant params,
  		 *     it would be allowed to interact with other curves with non-constant params
  		 *
  		 * @todo https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-7.html#unique-symbol
  		 * @module
  		 */
  		/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  		const hmac_js_1 = /*@__PURE__*/ requireHmac();
  		const utils_1 = /*@__PURE__*/ requireUtils$2();
  		const utils_ts_1 = /*@__PURE__*/ requireUtils$1();
  		const curve_ts_1 = /*@__PURE__*/ requireCurve();
  		const modular_ts_1 = /*@__PURE__*/ requireModular();
  		// We construct basis in such way that den is always positive and equals n, but num sign depends on basis (not on secret value)
  		const divNearest = (num, den) => (num + (num >= 0 ? den : -den) / _2n) / den;
  		/**
  		 * Splits scalar for GLV endomorphism.
  		 */
  		function _splitEndoScalar(k, basis, n) {
  		    // Split scalar into two such that part is ~half bits: `abs(part) < sqrt(N)`
  		    // Since part can be negative, we need to do this on point.
  		    // TODO: verifyScalar function which consumes lambda
  		    const [[a1, b1], [a2, b2]] = basis;
  		    const c1 = divNearest(b2 * k, n);
  		    const c2 = divNearest(-b1 * k, n);
  		    // |k1|/|k2| is < sqrt(N), but can be negative.
  		    // If we do `k1 mod N`, we'll get big scalar (`> sqrt(N)`): so, we do cheaper negation instead.
  		    let k1 = k - c1 * a1 - c2 * a2;
  		    let k2 = -c1 * b1 - c2 * b2;
  		    const k1neg = k1 < _0n;
  		    const k2neg = k2 < _0n;
  		    if (k1neg)
  		        k1 = -k1;
  		    if (k2neg)
  		        k2 = -k2;
  		    // Double check that resulting scalar less than half bits of N: otherwise wNAF will fail.
  		    // This should only happen on wrong basises. Also, math inside is too complex and I don't trust it.
  		    const MAX_NUM = (0, utils_ts_1.bitMask)(Math.ceil((0, utils_ts_1.bitLen)(n) / 2)) + _1n; // Half bits of N
  		    if (k1 < _0n || k1 >= MAX_NUM || k2 < _0n || k2 >= MAX_NUM) {
  		        throw new Error('splitScalar (endomorphism): failed, k=' + k);
  		    }
  		    return { k1neg, k1, k2neg, k2 };
  		}
  		function validateSigVerOpts(opts) {
  		    if (opts.lowS !== undefined)
  		        (0, utils_ts_1.abool)('lowS', opts.lowS);
  		    if (opts.prehash !== undefined)
  		        (0, utils_ts_1.abool)('prehash', opts.prehash);
  		}
  		class DERErr extends Error {
  		    constructor(m = '') {
  		        super(m);
  		    }
  		}
  		exports.DERErr = DERErr;
  		/**
  		 * ASN.1 DER encoding utilities. ASN is very complex & fragile. Format:
  		 *
  		 *     [0x30 (SEQUENCE), bytelength, 0x02 (INTEGER), intLength, R, 0x02 (INTEGER), intLength, S]
  		 *
  		 * Docs: https://letsencrypt.org/docs/a-warm-welcome-to-asn1-and-der/, https://luca.ntop.org/Teaching/Appunti/asn1.html
  		 */
  		exports.DER = {
  		    // asn.1 DER encoding utils
  		    Err: DERErr,
  		    // Basic building block is TLV (Tag-Length-Value)
  		    _tlv: {
  		        encode: (tag, data) => {
  		            const { Err: E } = exports.DER;
  		            if (tag < 0 || tag > 256)
  		                throw new E('tlv.encode: wrong tag');
  		            if (data.length & 1)
  		                throw new E('tlv.encode: unpadded data');
  		            const dataLen = data.length / 2;
  		            const len = (0, utils_ts_1.numberToHexUnpadded)(dataLen);
  		            if ((len.length / 2) & 128)
  		                throw new E('tlv.encode: long form length too big');
  		            // length of length with long form flag
  		            const lenLen = dataLen > 127 ? (0, utils_ts_1.numberToHexUnpadded)((len.length / 2) | 128) : '';
  		            const t = (0, utils_ts_1.numberToHexUnpadded)(tag);
  		            return t + lenLen + len + data;
  		        },
  		        // v - value, l - left bytes (unparsed)
  		        decode(tag, data) {
  		            const { Err: E } = exports.DER;
  		            let pos = 0;
  		            if (tag < 0 || tag > 256)
  		                throw new E('tlv.encode: wrong tag');
  		            if (data.length < 2 || data[pos++] !== tag)
  		                throw new E('tlv.decode: wrong tlv');
  		            const first = data[pos++];
  		            const isLong = !!(first & 128); // First bit of first length byte is flag for short/long form
  		            let length = 0;
  		            if (!isLong)
  		                length = first;
  		            else {
  		                // Long form: [longFlag(1bit), lengthLength(7bit), length (BE)]
  		                const lenLen = first & 127;
  		                if (!lenLen)
  		                    throw new E('tlv.decode(long): indefinite length not supported');
  		                if (lenLen > 4)
  		                    throw new E('tlv.decode(long): byte length is too big'); // this will overflow u32 in js
  		                const lengthBytes = data.subarray(pos, pos + lenLen);
  		                if (lengthBytes.length !== lenLen)
  		                    throw new E('tlv.decode: length bytes not complete');
  		                if (lengthBytes[0] === 0)
  		                    throw new E('tlv.decode(long): zero leftmost byte');
  		                for (const b of lengthBytes)
  		                    length = (length << 8) | b;
  		                pos += lenLen;
  		                if (length < 128)
  		                    throw new E('tlv.decode(long): not minimal encoding');
  		            }
  		            const v = data.subarray(pos, pos + length);
  		            if (v.length !== length)
  		                throw new E('tlv.decode: wrong value length');
  		            return { v, l: data.subarray(pos + length) };
  		        },
  		    },
  		    // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  		    // since we always use positive integers here. It must always be empty:
  		    // - add zero byte if exists
  		    // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  		    _int: {
  		        encode(num) {
  		            const { Err: E } = exports.DER;
  		            if (num < _0n)
  		                throw new E('integer: negative integers are not allowed');
  		            let hex = (0, utils_ts_1.numberToHexUnpadded)(num);
  		            // Pad with zero byte if negative flag is present
  		            if (Number.parseInt(hex[0], 16) & 0b1000)
  		                hex = '00' + hex;
  		            if (hex.length & 1)
  		                throw new E('unexpected DER parsing assertion: unpadded hex');
  		            return hex;
  		        },
  		        decode(data) {
  		            const { Err: E } = exports.DER;
  		            if (data[0] & 128)
  		                throw new E('invalid signature integer: negative');
  		            if (data[0] === 0x00 && !(data[1] & 128))
  		                throw new E('invalid signature integer: unnecessary leading zero');
  		            return (0, utils_ts_1.bytesToNumberBE)(data);
  		        },
  		    },
  		    toSig(hex) {
  		        // parse DER signature
  		        const { Err: E, _int: int, _tlv: tlv } = exports.DER;
  		        const data = (0, utils_ts_1.ensureBytes)('signature', hex);
  		        const { v: seqBytes, l: seqLeftBytes } = tlv.decode(0x30, data);
  		        if (seqLeftBytes.length)
  		            throw new E('invalid signature: left bytes after parsing');
  		        const { v: rBytes, l: rLeftBytes } = tlv.decode(0x02, seqBytes);
  		        const { v: sBytes, l: sLeftBytes } = tlv.decode(0x02, rLeftBytes);
  		        if (sLeftBytes.length)
  		            throw new E('invalid signature: left bytes after parsing');
  		        return { r: int.decode(rBytes), s: int.decode(sBytes) };
  		    },
  		    hexFromSig(sig) {
  		        const { _tlv: tlv, _int: int } = exports.DER;
  		        const rs = tlv.encode(0x02, int.encode(sig.r));
  		        const ss = tlv.encode(0x02, int.encode(sig.s));
  		        const seq = rs + ss;
  		        return tlv.encode(0x30, seq);
  		    },
  		};
  		// Be friendly to bad ECMAScript parsers by not using bigint literals
  		// prettier-ignore
  		const _0n = BigInt(0), _1n = BigInt(1), _2n = BigInt(2), _3n = BigInt(3), _4n = BigInt(4);
  		// TODO: remove
  		function _legacyHelperEquat(Fp, a, b) {
  		    /**
  		     * y² = x³ + ax + b: Short weierstrass curve formula. Takes x, returns y².
  		     * @returns y²
  		     */
  		    function weierstrassEquation(x) {
  		        const x2 = Fp.sqr(x); // x * x
  		        const x3 = Fp.mul(x2, x); // x² * x
  		        return Fp.add(Fp.add(x3, Fp.mul(x, a)), b); // x³ + a * x + b
  		    }
  		    return weierstrassEquation;
  		}
  		function _normFnElement(Fn, key) {
  		    const { BYTES: expected } = Fn;
  		    let num;
  		    if (typeof key === 'bigint') {
  		        num = key;
  		    }
  		    else {
  		        let bytes = (0, utils_ts_1.ensureBytes)('private key', key);
  		        try {
  		            num = Fn.fromBytes(bytes);
  		        }
  		        catch (error) {
  		            throw new Error(`invalid private key: expected ui8a of size ${expected}, got ${typeof key}`);
  		        }
  		    }
  		    if (!Fn.isValidNot0(num))
  		        throw new Error('invalid private key: out of range [1..N-1]');
  		    return num;
  		}
  		function weierstrassN(CURVE, curveOpts = {}) {
  		    const { Fp, Fn } = (0, curve_ts_1._createCurveFields)('weierstrass', CURVE, curveOpts);
  		    const { h: cofactor, n: CURVE_ORDER } = CURVE;
  		    (0, utils_ts_1._validateObject)(curveOpts, {}, {
  		        allowInfinityPoint: 'boolean',
  		        clearCofactor: 'function',
  		        isTorsionFree: 'function',
  		        fromBytes: 'function',
  		        toBytes: 'function',
  		        endo: 'object',
  		        wrapPrivateKey: 'boolean',
  		    });
  		    const { endo } = curveOpts;
  		    if (endo) {
  		        // validateObject(endo, { beta: 'bigint', splitScalar: 'function' });
  		        if (!Fp.is0(CURVE.a) || typeof endo.beta !== 'bigint' || !Array.isArray(endo.basises)) {
  		            throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  		        }
  		    }
  		    function assertCompressionIsSupported() {
  		        if (!Fp.isOdd)
  		            throw new Error('compression is not supported: Field does not have .isOdd()');
  		    }
  		    // Implements IEEE P1363 point encoding
  		    function pointToBytes(_c, point, isCompressed) {
  		        const { x, y } = point.toAffine();
  		        const bx = Fp.toBytes(x);
  		        (0, utils_ts_1.abool)('isCompressed', isCompressed);
  		        if (isCompressed) {
  		            assertCompressionIsSupported();
  		            const hasEvenY = !Fp.isOdd(y);
  		            return (0, utils_ts_1.concatBytes)(pprefix(hasEvenY), bx);
  		        }
  		        else {
  		            return (0, utils_ts_1.concatBytes)(Uint8Array.of(0x04), bx, Fp.toBytes(y));
  		        }
  		    }
  		    function pointFromBytes(bytes) {
  		        (0, utils_ts_1.abytes)(bytes);
  		        const L = Fp.BYTES;
  		        const LC = L + 1; // length compressed, e.g. 33 for 32-byte field
  		        const LU = 2 * L + 1; // length uncompressed, e.g. 65 for 32-byte field
  		        const length = bytes.length;
  		        const head = bytes[0];
  		        const tail = bytes.subarray(1);
  		        // No actual validation is done here: use .assertValidity()
  		        if (length === LC && (head === 0x02 || head === 0x03)) {
  		            const x = Fp.fromBytes(tail);
  		            if (!Fp.isValid(x))
  		                throw new Error('bad point: is not on curve, wrong x');
  		            const y2 = weierstrassEquation(x); // y² = x³ + ax + b
  		            let y;
  		            try {
  		                y = Fp.sqrt(y2); // y = y² ^ (p+1)/4
  		            }
  		            catch (sqrtError) {
  		                const err = sqrtError instanceof Error ? ': ' + sqrtError.message : '';
  		                throw new Error('bad point: is not on curve, sqrt error' + err);
  		            }
  		            assertCompressionIsSupported();
  		            const isYOdd = Fp.isOdd(y); // (y & _1n) === _1n;
  		            const isHeadOdd = (head & 1) === 1; // ECDSA-specific
  		            if (isHeadOdd !== isYOdd)
  		                y = Fp.neg(y);
  		            return { x, y };
  		        }
  		        else if (length === LU && head === 0x04) {
  		            // TODO: more checks
  		            const x = Fp.fromBytes(tail.subarray(L * 0, L * 1));
  		            const y = Fp.fromBytes(tail.subarray(L * 1, L * 2));
  		            if (!isValidXY(x, y))
  		                throw new Error('bad point: is not on curve');
  		            return { x, y };
  		        }
  		        else {
  		            throw new Error(`bad point: got length ${length}, expected compressed=${LC} or uncompressed=${LU}`);
  		        }
  		    }
  		    const toBytes = curveOpts.toBytes || pointToBytes;
  		    const fromBytes = curveOpts.fromBytes || pointFromBytes;
  		    const weierstrassEquation = _legacyHelperEquat(Fp, CURVE.a, CURVE.b);
  		    // TODO: move top-level
  		    /** Checks whether equation holds for given x, y: y² == x³ + ax + b */
  		    function isValidXY(x, y) {
  		        const left = Fp.sqr(y); // y²
  		        const right = weierstrassEquation(x); // x³ + ax + b
  		        return Fp.eql(left, right);
  		    }
  		    // Validate whether the passed curve params are valid.
  		    // Test 1: equation y² = x³ + ax + b should work for generator point.
  		    if (!isValidXY(CURVE.Gx, CURVE.Gy))
  		        throw new Error('bad curve params: generator point');
  		    // Test 2: discriminant Δ part should be non-zero: 4a³ + 27b² != 0.
  		    // Guarantees curve is genus-1, smooth (non-singular).
  		    const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n), _4n);
  		    const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
  		    if (Fp.is0(Fp.add(_4a3, _27b2)))
  		        throw new Error('bad curve params: a or b');
  		    /** Asserts coordinate is valid: 0 <= n < Fp.ORDER. */
  		    function acoord(title, n, banZero = false) {
  		        if (!Fp.isValid(n) || (banZero && Fp.is0(n)))
  		            throw new Error(`bad point coordinate ${title}`);
  		        return n;
  		    }
  		    function aprjpoint(other) {
  		        if (!(other instanceof Point))
  		            throw new Error('ProjectivePoint expected');
  		    }
  		    function splitEndoScalarN(k) {
  		        if (!endo || !endo.basises)
  		            throw new Error('no endo');
  		        return _splitEndoScalar(k, endo.basises, Fn.ORDER);
  		    }
  		    // Memoized toAffine / validity check. They are heavy. Points are immutable.
  		    // Converts Projective point to affine (x, y) coordinates.
  		    // Can accept precomputed Z^-1 - for example, from invertBatch.
  		    // (X, Y, Z) ∋ (x=X/Z, y=Y/Z)
  		    const toAffineMemo = (0, utils_ts_1.memoized)((p, iz) => {
  		        const { X, Y, Z } = p;
  		        // Fast-path for normalized points
  		        if (Fp.eql(Z, Fp.ONE))
  		            return { x: X, y: Y };
  		        const is0 = p.is0();
  		        // If invZ was 0, we return zero point. However we still want to execute
  		        // all operations, so we replace invZ with a random number, 1.
  		        if (iz == null)
  		            iz = is0 ? Fp.ONE : Fp.inv(Z);
  		        const x = Fp.mul(X, iz);
  		        const y = Fp.mul(Y, iz);
  		        const zz = Fp.mul(Z, iz);
  		        if (is0)
  		            return { x: Fp.ZERO, y: Fp.ZERO };
  		        if (!Fp.eql(zz, Fp.ONE))
  		            throw new Error('invZ was invalid');
  		        return { x, y };
  		    });
  		    // NOTE: on exception this will crash 'cached' and no value will be set.
  		    // Otherwise true will be return
  		    const assertValidMemo = (0, utils_ts_1.memoized)((p) => {
  		        if (p.is0()) {
  		            // (0, 1, 0) aka ZERO is invalid in most contexts.
  		            // In BLS, ZERO can be serialized, so we allow it.
  		            // (0, 0, 0) is invalid representation of ZERO.
  		            if (curveOpts.allowInfinityPoint && !Fp.is0(p.Y))
  		                return;
  		            throw new Error('bad point: ZERO');
  		        }
  		        // Some 3rd-party test vectors require different wording between here & `fromCompressedHex`
  		        const { x, y } = p.toAffine();
  		        if (!Fp.isValid(x) || !Fp.isValid(y))
  		            throw new Error('bad point: x or y not field elements');
  		        if (!isValidXY(x, y))
  		            throw new Error('bad point: equation left != right');
  		        if (!p.isTorsionFree())
  		            throw new Error('bad point: not in prime-order subgroup');
  		        return true;
  		    });
  		    function finishEndo(endoBeta, k1p, k2p, k1neg, k2neg) {
  		        k2p = new Point(Fp.mul(k2p.X, endoBeta), k2p.Y, k2p.Z);
  		        k1p = (0, curve_ts_1.negateCt)(k1neg, k1p);
  		        k2p = (0, curve_ts_1.negateCt)(k2neg, k2p);
  		        return k1p.add(k2p);
  		    }
  		    /**
  		     * Projective Point works in 3d / projective (homogeneous) coordinates:(X, Y, Z) ∋ (x=X/Z, y=Y/Z).
  		     * Default Point works in 2d / affine coordinates: (x, y).
  		     * We're doing calculations in projective, because its operations don't require costly inversion.
  		     */
  		    class Point {
  		        /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
  		        constructor(X, Y, Z) {
  		            this.X = acoord('x', X);
  		            this.Y = acoord('y', Y, true);
  		            this.Z = acoord('z', Z);
  		            Object.freeze(this);
  		        }
  		        /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
  		        static fromAffine(p) {
  		            const { x, y } = p || {};
  		            if (!p || !Fp.isValid(x) || !Fp.isValid(y))
  		                throw new Error('invalid affine point');
  		            if (p instanceof Point)
  		                throw new Error('projective point not allowed');
  		            // (0, 0) would've produced (0, 0, 1) - instead, we need (0, 1, 0)
  		            if (Fp.is0(x) && Fp.is0(y))
  		                return Point.ZERO;
  		            return new Point(x, y, Fp.ONE);
  		        }
  		        get x() {
  		            return this.toAffine().x;
  		        }
  		        get y() {
  		            return this.toAffine().y;
  		        }
  		        // TODO: remove
  		        get px() {
  		            return this.X;
  		        }
  		        get py() {
  		            return this.X;
  		        }
  		        get pz() {
  		            return this.Z;
  		        }
  		        static normalizeZ(points) {
  		            return (0, curve_ts_1.normalizeZ)(Point, points);
  		        }
  		        static fromBytes(bytes) {
  		            (0, utils_ts_1.abytes)(bytes);
  		            return Point.fromHex(bytes);
  		        }
  		        /** Converts hash string or Uint8Array to Point. */
  		        static fromHex(hex) {
  		            const P = Point.fromAffine(fromBytes((0, utils_ts_1.ensureBytes)('pointHex', hex)));
  		            P.assertValidity();
  		            return P;
  		        }
  		        /** Multiplies generator point by privateKey. */
  		        static fromPrivateKey(privateKey) {
  		            return Point.BASE.multiply(_normFnElement(Fn, privateKey));
  		        }
  		        // TODO: remove
  		        static msm(points, scalars) {
  		            return (0, curve_ts_1.pippenger)(Point, Fn, points, scalars);
  		        }
  		        _setWindowSize(windowSize) {
  		            this.precompute(windowSize);
  		        }
  		        /**
  		         *
  		         * @param windowSize
  		         * @param isLazy true will defer table computation until the first multiplication
  		         * @returns
  		         */
  		        precompute(windowSize = 8, isLazy = true) {
  		            wnaf.createCache(this, windowSize);
  		            if (!isLazy)
  		                this.multiply(_3n); // random number
  		            return this;
  		        }
  		        // TODO: return `this`
  		        /** A point on curve is valid if it conforms to equation. */
  		        assertValidity() {
  		            assertValidMemo(this);
  		        }
  		        hasEvenY() {
  		            const { y } = this.toAffine();
  		            if (!Fp.isOdd)
  		                throw new Error("Field doesn't support isOdd");
  		            return !Fp.isOdd(y);
  		        }
  		        /** Compare one point to another. */
  		        equals(other) {
  		            aprjpoint(other);
  		            const { X: X1, Y: Y1, Z: Z1 } = this;
  		            const { X: X2, Y: Y2, Z: Z2 } = other;
  		            const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
  		            const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
  		            return U1 && U2;
  		        }
  		        /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
  		        negate() {
  		            return new Point(this.X, Fp.neg(this.Y), this.Z);
  		        }
  		        // Renes-Costello-Batina exception-free doubling formula.
  		        // There is 30% faster Jacobian formula, but it is not complete.
  		        // https://eprint.iacr.org/2015/1060, algorithm 3
  		        // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
  		        double() {
  		            const { a, b } = CURVE;
  		            const b3 = Fp.mul(b, _3n);
  		            const { X: X1, Y: Y1, Z: Z1 } = this;
  		            let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
  		            let t0 = Fp.mul(X1, X1); // step 1
  		            let t1 = Fp.mul(Y1, Y1);
  		            let t2 = Fp.mul(Z1, Z1);
  		            let t3 = Fp.mul(X1, Y1);
  		            t3 = Fp.add(t3, t3); // step 5
  		            Z3 = Fp.mul(X1, Z1);
  		            Z3 = Fp.add(Z3, Z3);
  		            X3 = Fp.mul(a, Z3);
  		            Y3 = Fp.mul(b3, t2);
  		            Y3 = Fp.add(X3, Y3); // step 10
  		            X3 = Fp.sub(t1, Y3);
  		            Y3 = Fp.add(t1, Y3);
  		            Y3 = Fp.mul(X3, Y3);
  		            X3 = Fp.mul(t3, X3);
  		            Z3 = Fp.mul(b3, Z3); // step 15
  		            t2 = Fp.mul(a, t2);
  		            t3 = Fp.sub(t0, t2);
  		            t3 = Fp.mul(a, t3);
  		            t3 = Fp.add(t3, Z3);
  		            Z3 = Fp.add(t0, t0); // step 20
  		            t0 = Fp.add(Z3, t0);
  		            t0 = Fp.add(t0, t2);
  		            t0 = Fp.mul(t0, t3);
  		            Y3 = Fp.add(Y3, t0);
  		            t2 = Fp.mul(Y1, Z1); // step 25
  		            t2 = Fp.add(t2, t2);
  		            t0 = Fp.mul(t2, t3);
  		            X3 = Fp.sub(X3, t0);
  		            Z3 = Fp.mul(t2, t1);
  		            Z3 = Fp.add(Z3, Z3); // step 30
  		            Z3 = Fp.add(Z3, Z3);
  		            return new Point(X3, Y3, Z3);
  		        }
  		        // Renes-Costello-Batina exception-free addition formula.
  		        // There is 30% faster Jacobian formula, but it is not complete.
  		        // https://eprint.iacr.org/2015/1060, algorithm 1
  		        // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
  		        add(other) {
  		            aprjpoint(other);
  		            const { X: X1, Y: Y1, Z: Z1 } = this;
  		            const { X: X2, Y: Y2, Z: Z2 } = other;
  		            let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
  		            const a = CURVE.a;
  		            const b3 = Fp.mul(CURVE.b, _3n);
  		            let t0 = Fp.mul(X1, X2); // step 1
  		            let t1 = Fp.mul(Y1, Y2);
  		            let t2 = Fp.mul(Z1, Z2);
  		            let t3 = Fp.add(X1, Y1);
  		            let t4 = Fp.add(X2, Y2); // step 5
  		            t3 = Fp.mul(t3, t4);
  		            t4 = Fp.add(t0, t1);
  		            t3 = Fp.sub(t3, t4);
  		            t4 = Fp.add(X1, Z1);
  		            let t5 = Fp.add(X2, Z2); // step 10
  		            t4 = Fp.mul(t4, t5);
  		            t5 = Fp.add(t0, t2);
  		            t4 = Fp.sub(t4, t5);
  		            t5 = Fp.add(Y1, Z1);
  		            X3 = Fp.add(Y2, Z2); // step 15
  		            t5 = Fp.mul(t5, X3);
  		            X3 = Fp.add(t1, t2);
  		            t5 = Fp.sub(t5, X3);
  		            Z3 = Fp.mul(a, t4);
  		            X3 = Fp.mul(b3, t2); // step 20
  		            Z3 = Fp.add(X3, Z3);
  		            X3 = Fp.sub(t1, Z3);
  		            Z3 = Fp.add(t1, Z3);
  		            Y3 = Fp.mul(X3, Z3);
  		            t1 = Fp.add(t0, t0); // step 25
  		            t1 = Fp.add(t1, t0);
  		            t2 = Fp.mul(a, t2);
  		            t4 = Fp.mul(b3, t4);
  		            t1 = Fp.add(t1, t2);
  		            t2 = Fp.sub(t0, t2); // step 30
  		            t2 = Fp.mul(a, t2);
  		            t4 = Fp.add(t4, t2);
  		            t0 = Fp.mul(t1, t4);
  		            Y3 = Fp.add(Y3, t0);
  		            t0 = Fp.mul(t5, t4); // step 35
  		            X3 = Fp.mul(t3, X3);
  		            X3 = Fp.sub(X3, t0);
  		            t0 = Fp.mul(t3, t1);
  		            Z3 = Fp.mul(t5, Z3);
  		            Z3 = Fp.add(Z3, t0); // step 40
  		            return new Point(X3, Y3, Z3);
  		        }
  		        subtract(other) {
  		            return this.add(other.negate());
  		        }
  		        is0() {
  		            return this.equals(Point.ZERO);
  		        }
  		        /**
  		         * Constant time multiplication.
  		         * Uses wNAF method. Windowed method may be 10% faster,
  		         * but takes 2x longer to generate and consumes 2x memory.
  		         * Uses precomputes when available.
  		         * Uses endomorphism for Koblitz curves.
  		         * @param scalar by which the point would be multiplied
  		         * @returns New point
  		         */
  		        multiply(scalar) {
  		            const { endo } = curveOpts;
  		            if (!Fn.isValidNot0(scalar))
  		                throw new Error('invalid scalar: out of range'); // 0 is invalid
  		            let point, fake; // Fake point is used to const-time mult
  		            const mul = (n) => wnaf.cached(this, n, (p) => (0, curve_ts_1.normalizeZ)(Point, p));
  		            /** See docs for {@link EndomorphismOpts} */
  		            if (endo) {
  		                const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(scalar);
  		                const { p: k1p, f: k1f } = mul(k1);
  		                const { p: k2p, f: k2f } = mul(k2);
  		                fake = k1f.add(k2f);
  		                point = finishEndo(endo.beta, k1p, k2p, k1neg, k2neg);
  		            }
  		            else {
  		                const { p, f } = mul(scalar);
  		                point = p;
  		                fake = f;
  		            }
  		            // Normalize `z` for both points, but return only real one
  		            return (0, curve_ts_1.normalizeZ)(Point, [point, fake])[0];
  		        }
  		        /**
  		         * Non-constant-time multiplication. Uses double-and-add algorithm.
  		         * It's faster, but should only be used when you don't care about
  		         * an exposed secret key e.g. sig verification, which works over *public* keys.
  		         */
  		        multiplyUnsafe(sc) {
  		            const { endo } = curveOpts;
  		            const p = this;
  		            if (!Fn.isValid(sc))
  		                throw new Error('invalid scalar: out of range'); // 0 is valid
  		            if (sc === _0n || p.is0())
  		                return Point.ZERO;
  		            if (sc === _1n)
  		                return p; // fast-path
  		            if (wnaf.hasCache(this))
  		                return this.multiply(sc);
  		            if (endo) {
  		                const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(sc);
  		                const { p1, p2 } = (0, curve_ts_1.mulEndoUnsafe)(Point, p, k1, k2); // 30% faster vs wnaf.unsafe
  		                return finishEndo(endo.beta, p1, p2, k1neg, k2neg);
  		            }
  		            else {
  		                return wnaf.unsafe(p, sc);
  		            }
  		        }
  		        multiplyAndAddUnsafe(Q, a, b) {
  		            const sum = this.multiplyUnsafe(a).add(Q.multiplyUnsafe(b));
  		            return sum.is0() ? undefined : sum;
  		        }
  		        /**
  		         * Converts Projective point to affine (x, y) coordinates.
  		         * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
  		         */
  		        toAffine(invertedZ) {
  		            return toAffineMemo(this, invertedZ);
  		        }
  		        /**
  		         * Checks whether Point is free of torsion elements (is in prime subgroup).
  		         * Always torsion-free for cofactor=1 curves.
  		         */
  		        isTorsionFree() {
  		            const { isTorsionFree } = curveOpts;
  		            if (cofactor === _1n)
  		                return true;
  		            if (isTorsionFree)
  		                return isTorsionFree(Point, this);
  		            return wnaf.unsafe(this, CURVE_ORDER).is0();
  		        }
  		        clearCofactor() {
  		            const { clearCofactor } = curveOpts;
  		            if (cofactor === _1n)
  		                return this; // Fast-path
  		            if (clearCofactor)
  		                return clearCofactor(Point, this);
  		            return this.multiplyUnsafe(cofactor);
  		        }
  		        isSmallOrder() {
  		            // can we use this.clearCofactor()?
  		            return this.multiplyUnsafe(cofactor).is0();
  		        }
  		        toBytes(isCompressed = true) {
  		            (0, utils_ts_1.abool)('isCompressed', isCompressed);
  		            this.assertValidity();
  		            return toBytes(Point, this, isCompressed);
  		        }
  		        /** @deprecated use `toBytes` */
  		        toRawBytes(isCompressed = true) {
  		            return this.toBytes(isCompressed);
  		        }
  		        toHex(isCompressed = true) {
  		            return (0, utils_ts_1.bytesToHex)(this.toBytes(isCompressed));
  		        }
  		        toString() {
  		            return `<Point ${this.is0() ? 'ZERO' : this.toHex()}>`;
  		        }
  		    }
  		    // base / generator point
  		    Point.BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
  		    // zero / infinity / identity point
  		    Point.ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO); // 0, 1, 0
  		    // fields
  		    Point.Fp = Fp;
  		    Point.Fn = Fn;
  		    const bits = Fn.BITS;
  		    const wnaf = new curve_ts_1.wNAF(Point, curveOpts.endo ? Math.ceil(bits / 2) : bits);
  		    return Point;
  		}
  		// _legacyWeierstrass
  		// TODO: remove
  		/** @deprecated use `weierstrass` in newer releases */
  		function weierstrassPoints(c) {
  		    const { CURVE, curveOpts } = _weierstrass_legacy_opts_to_new(c);
  		    const Point = weierstrassN(CURVE, curveOpts);
  		    return _weierstrass_new_output_to_legacy(c, Point);
  		}
  		// Points start with byte 0x02 when y is even; otherwise 0x03
  		function pprefix(hasEvenY) {
  		    return Uint8Array.of(hasEvenY ? 0x02 : 0x03);
  		}
  		/**
  		 * Implementation of the Shallue and van de Woestijne method for any weierstrass curve.
  		 * TODO: check if there is a way to merge this with uvRatio in Edwards; move to modular.
  		 * b = True and y = sqrt(u / v) if (u / v) is square in F, and
  		 * b = False and y = sqrt(Z * (u / v)) otherwise.
  		 * @param Fp
  		 * @param Z
  		 * @returns
  		 */
  		function SWUFpSqrtRatio(Fp, Z) {
  		    // Generic implementation
  		    const q = Fp.ORDER;
  		    let l = _0n;
  		    for (let o = q - _1n; o % _2n === _0n; o /= _2n)
  		        l += _1n;
  		    const c1 = l; // 1. c1, the largest integer such that 2^c1 divides q - 1.
  		    // We need 2n ** c1 and 2n ** (c1-1). We can't use **; but we can use <<.
  		    // 2n ** c1 == 2n << (c1-1)
  		    const _2n_pow_c1_1 = _2n << (c1 - _1n - _1n);
  		    const _2n_pow_c1 = _2n_pow_c1_1 * _2n;
  		    const c2 = (q - _1n) / _2n_pow_c1; // 2. c2 = (q - 1) / (2^c1)  # Integer arithmetic
  		    const c3 = (c2 - _1n) / _2n; // 3. c3 = (c2 - 1) / 2            # Integer arithmetic
  		    const c4 = _2n_pow_c1 - _1n; // 4. c4 = 2^c1 - 1                # Integer arithmetic
  		    const c5 = _2n_pow_c1_1; // 5. c5 = 2^(c1 - 1)                  # Integer arithmetic
  		    const c6 = Fp.pow(Z, c2); // 6. c6 = Z^c2
  		    const c7 = Fp.pow(Z, (c2 + _1n) / _2n); // 7. c7 = Z^((c2 + 1) / 2)
  		    let sqrtRatio = (u, v) => {
  		        let tv1 = c6; // 1. tv1 = c6
  		        let tv2 = Fp.pow(v, c4); // 2. tv2 = v^c4
  		        let tv3 = Fp.sqr(tv2); // 3. tv3 = tv2^2
  		        tv3 = Fp.mul(tv3, v); // 4. tv3 = tv3 * v
  		        let tv5 = Fp.mul(u, tv3); // 5. tv5 = u * tv3
  		        tv5 = Fp.pow(tv5, c3); // 6. tv5 = tv5^c3
  		        tv5 = Fp.mul(tv5, tv2); // 7. tv5 = tv5 * tv2
  		        tv2 = Fp.mul(tv5, v); // 8. tv2 = tv5 * v
  		        tv3 = Fp.mul(tv5, u); // 9. tv3 = tv5 * u
  		        let tv4 = Fp.mul(tv3, tv2); // 10. tv4 = tv3 * tv2
  		        tv5 = Fp.pow(tv4, c5); // 11. tv5 = tv4^c5
  		        let isQR = Fp.eql(tv5, Fp.ONE); // 12. isQR = tv5 == 1
  		        tv2 = Fp.mul(tv3, c7); // 13. tv2 = tv3 * c7
  		        tv5 = Fp.mul(tv4, tv1); // 14. tv5 = tv4 * tv1
  		        tv3 = Fp.cmov(tv2, tv3, isQR); // 15. tv3 = CMOV(tv2, tv3, isQR)
  		        tv4 = Fp.cmov(tv5, tv4, isQR); // 16. tv4 = CMOV(tv5, tv4, isQR)
  		        // 17. for i in (c1, c1 - 1, ..., 2):
  		        for (let i = c1; i > _1n; i--) {
  		            let tv5 = i - _2n; // 18.    tv5 = i - 2
  		            tv5 = _2n << (tv5 - _1n); // 19.    tv5 = 2^tv5
  		            let tvv5 = Fp.pow(tv4, tv5); // 20.    tv5 = tv4^tv5
  		            const e1 = Fp.eql(tvv5, Fp.ONE); // 21.    e1 = tv5 == 1
  		            tv2 = Fp.mul(tv3, tv1); // 22.    tv2 = tv3 * tv1
  		            tv1 = Fp.mul(tv1, tv1); // 23.    tv1 = tv1 * tv1
  		            tvv5 = Fp.mul(tv4, tv1); // 24.    tv5 = tv4 * tv1
  		            tv3 = Fp.cmov(tv2, tv3, e1); // 25.    tv3 = CMOV(tv2, tv3, e1)
  		            tv4 = Fp.cmov(tvv5, tv4, e1); // 26.    tv4 = CMOV(tv5, tv4, e1)
  		        }
  		        return { isValid: isQR, value: tv3 };
  		    };
  		    if (Fp.ORDER % _4n === _3n) {
  		        // sqrt_ratio_3mod4(u, v)
  		        const c1 = (Fp.ORDER - _3n) / _4n; // 1. c1 = (q - 3) / 4     # Integer arithmetic
  		        const c2 = Fp.sqrt(Fp.neg(Z)); // 2. c2 = sqrt(-Z)
  		        sqrtRatio = (u, v) => {
  		            let tv1 = Fp.sqr(v); // 1. tv1 = v^2
  		            const tv2 = Fp.mul(u, v); // 2. tv2 = u * v
  		            tv1 = Fp.mul(tv1, tv2); // 3. tv1 = tv1 * tv2
  		            let y1 = Fp.pow(tv1, c1); // 4. y1 = tv1^c1
  		            y1 = Fp.mul(y1, tv2); // 5. y1 = y1 * tv2
  		            const y2 = Fp.mul(y1, c2); // 6. y2 = y1 * c2
  		            const tv3 = Fp.mul(Fp.sqr(y1), v); // 7. tv3 = y1^2; 8. tv3 = tv3 * v
  		            const isQR = Fp.eql(tv3, u); // 9. isQR = tv3 == u
  		            let y = Fp.cmov(y2, y1, isQR); // 10. y = CMOV(y2, y1, isQR)
  		            return { isValid: isQR, value: y }; // 11. return (isQR, y) isQR ? y : y*c2
  		        };
  		    }
  		    // No curves uses that
  		    // if (Fp.ORDER % _8n === _5n) // sqrt_ratio_5mod8
  		    return sqrtRatio;
  		}
  		/**
  		 * Simplified Shallue-van de Woestijne-Ulas Method
  		 * https://www.rfc-editor.org/rfc/rfc9380#section-6.6.2
  		 */
  		function mapToCurveSimpleSWU(Fp, opts) {
  		    (0, modular_ts_1.validateField)(Fp);
  		    const { A, B, Z } = opts;
  		    if (!Fp.isValid(A) || !Fp.isValid(B) || !Fp.isValid(Z))
  		        throw new Error('mapToCurveSimpleSWU: invalid opts');
  		    const sqrtRatio = SWUFpSqrtRatio(Fp, Z);
  		    if (!Fp.isOdd)
  		        throw new Error('Field does not have .isOdd()');
  		    // Input: u, an element of F.
  		    // Output: (x, y), a point on E.
  		    return (u) => {
  		        // prettier-ignore
  		        let tv1, tv2, tv3, tv4, tv5, tv6, x, y;
  		        tv1 = Fp.sqr(u); // 1.  tv1 = u^2
  		        tv1 = Fp.mul(tv1, Z); // 2.  tv1 = Z * tv1
  		        tv2 = Fp.sqr(tv1); // 3.  tv2 = tv1^2
  		        tv2 = Fp.add(tv2, tv1); // 4.  tv2 = tv2 + tv1
  		        tv3 = Fp.add(tv2, Fp.ONE); // 5.  tv3 = tv2 + 1
  		        tv3 = Fp.mul(tv3, B); // 6.  tv3 = B * tv3
  		        tv4 = Fp.cmov(Z, Fp.neg(tv2), !Fp.eql(tv2, Fp.ZERO)); // 7.  tv4 = CMOV(Z, -tv2, tv2 != 0)
  		        tv4 = Fp.mul(tv4, A); // 8.  tv4 = A * tv4
  		        tv2 = Fp.sqr(tv3); // 9.  tv2 = tv3^2
  		        tv6 = Fp.sqr(tv4); // 10. tv6 = tv4^2
  		        tv5 = Fp.mul(tv6, A); // 11. tv5 = A * tv6
  		        tv2 = Fp.add(tv2, tv5); // 12. tv2 = tv2 + tv5
  		        tv2 = Fp.mul(tv2, tv3); // 13. tv2 = tv2 * tv3
  		        tv6 = Fp.mul(tv6, tv4); // 14. tv6 = tv6 * tv4
  		        tv5 = Fp.mul(tv6, B); // 15. tv5 = B * tv6
  		        tv2 = Fp.add(tv2, tv5); // 16. tv2 = tv2 + tv5
  		        x = Fp.mul(tv1, tv3); // 17.   x = tv1 * tv3
  		        const { isValid, value } = sqrtRatio(tv2, tv6); // 18. (is_gx1_square, y1) = sqrt_ratio(tv2, tv6)
  		        y = Fp.mul(tv1, u); // 19.   y = tv1 * u  -> Z * u^3 * y1
  		        y = Fp.mul(y, value); // 20.   y = y * y1
  		        x = Fp.cmov(x, tv3, isValid); // 21.   x = CMOV(x, tv3, is_gx1_square)
  		        y = Fp.cmov(y, value, isValid); // 22.   y = CMOV(y, y1, is_gx1_square)
  		        const e1 = Fp.isOdd(u) === Fp.isOdd(y); // 23.  e1 = sgn0(u) == sgn0(y)
  		        y = Fp.cmov(Fp.neg(y), y, e1); // 24.   y = CMOV(-y, y, e1)
  		        const tv4_inv = (0, modular_ts_1.FpInvertBatch)(Fp, [tv4], true)[0];
  		        x = Fp.mul(x, tv4_inv); // 25.   x = x / tv4
  		        return { x, y };
  		    };
  		}
  		/**
  		 * Creates ECDSA for given elliptic curve Point and hash function.
  		 */
  		function ecdsa(Point, hash, ecdsaOpts = {}) {
  		    (0, utils_1.ahash)(hash);
  		    (0, utils_ts_1._validateObject)(ecdsaOpts, {}, {
  		        hmac: 'function',
  		        lowS: 'boolean',
  		        randomBytes: 'function',
  		        bits2int: 'function',
  		        bits2int_modN: 'function',
  		    });
  		    const randomBytes_ = ecdsaOpts.randomBytes || utils_ts_1.randomBytes;
  		    const hmac_ = ecdsaOpts.hmac ||
  		        ((key, ...msgs) => (0, hmac_js_1.hmac)(hash, key, (0, utils_ts_1.concatBytes)(...msgs)));
  		    const { Fp, Fn } = Point;
  		    const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
  		    const seedLen = (0, modular_ts_1.getMinHashLength)(CURVE_ORDER);
  		    const lengths = {
  		        secret: Fn.BYTES,
  		        public: 1 + Fp.BYTES,
  		        publicUncompressed: 1 + 2 * Fp.BYTES,
  		        signature: 2 * Fn.BYTES,
  		        seed: seedLen,
  		    };
  		    function isBiggerThanHalfOrder(number) {
  		        const HALF = CURVE_ORDER >> _1n;
  		        return number > HALF;
  		    }
  		    function normalizeS(s) {
  		        return isBiggerThanHalfOrder(s) ? Fn.neg(s) : s;
  		    }
  		    function aValidRS(title, num) {
  		        if (!Fn.isValidNot0(num))
  		            throw new Error(`invalid signature ${title}: out of range 1..CURVE.n`);
  		    }
  		    /**
  		     * ECDSA signature with its (r, s) properties. Supports DER & compact representations.
  		     */
  		    class Signature {
  		        constructor(r, s, recovery) {
  		            aValidRS('r', r); // r in [1..N-1]
  		            aValidRS('s', s); // s in [1..N-1]
  		            this.r = r;
  		            this.s = s;
  		            if (recovery != null)
  		                this.recovery = recovery;
  		            Object.freeze(this);
  		        }
  		        static fromBytes(bytes, format = 'compact') {
  		            if (format === 'compact') {
  		                const L = Fn.BYTES;
  		                (0, utils_ts_1.abytes)(bytes, L * 2);
  		                const r = bytes.subarray(0, L);
  		                const s = bytes.subarray(L, L * 2);
  		                return new Signature(Fn.fromBytes(r), Fn.fromBytes(s));
  		            }
  		            if (format === 'der') {
  		                (0, utils_ts_1.abytes)(bytes);
  		                const { r, s } = exports.DER.toSig(bytes);
  		                return new Signature(r, s);
  		            }
  		            throw new Error('invalid format');
  		        }
  		        static fromHex(hex, format) {
  		            return this.fromBytes((0, utils_ts_1.hexToBytes)(hex), format);
  		        }
  		        addRecoveryBit(recovery) {
  		            return new Signature(this.r, this.s, recovery);
  		        }
  		        // ProjPointType<bigint>
  		        recoverPublicKey(msgHash) {
  		            const FIELD_ORDER = Fp.ORDER;
  		            const { r, s, recovery: rec } = this;
  		            if (rec == null || ![0, 1, 2, 3].includes(rec))
  		                throw new Error('recovery id invalid');
  		            // ECDSA recovery is hard for cofactor > 1 curves.
  		            // In sign, `r = q.x mod n`, and here we recover q.x from r.
  		            // While recovering q.x >= n, we need to add r+n for cofactor=1 curves.
  		            // However, for cofactor>1, r+n may not get q.x:
  		            // r+n*i would need to be done instead where i is unknown.
  		            // To easily get i, we either need to:
  		            // a. increase amount of valid recid values (4, 5...); OR
  		            // b. prohibit non-prime-order signatures (recid > 1).
  		            const hasCofactor = CURVE_ORDER * _2n < FIELD_ORDER;
  		            if (hasCofactor && rec > 1)
  		                throw new Error('recovery id is ambiguous for h>1 curve');
  		            const radj = rec === 2 || rec === 3 ? r + CURVE_ORDER : r;
  		            if (!Fp.isValid(radj))
  		                throw new Error('recovery id 2 or 3 invalid');
  		            const x = Fp.toBytes(radj);
  		            const R = Point.fromHex((0, utils_ts_1.concatBytes)(pprefix((rec & 1) === 0), x));
  		            const ir = Fn.inv(radj); // r^-1
  		            const h = bits2int_modN((0, utils_ts_1.ensureBytes)('msgHash', msgHash)); // Truncate hash
  		            const u1 = Fn.create(-h * ir); // -hr^-1
  		            const u2 = Fn.create(s * ir); // sr^-1
  		            // (sr^-1)R-(hr^-1)G = -(hr^-1)G + (sr^-1). unsafe is fine: there is no private data.
  		            const Q = Point.BASE.multiplyUnsafe(u1).add(R.multiplyUnsafe(u2));
  		            if (Q.is0())
  		                throw new Error('point at infinify');
  		            Q.assertValidity();
  		            return Q;
  		        }
  		        // Signatures should be low-s, to prevent malleability.
  		        hasHighS() {
  		            return isBiggerThanHalfOrder(this.s);
  		        }
  		        normalizeS() {
  		            return this.hasHighS() ? new Signature(this.r, Fn.neg(this.s), this.recovery) : this;
  		        }
  		        toBytes(format = 'compact') {
  		            if (format === 'compact')
  		                return (0, utils_ts_1.concatBytes)(Fn.toBytes(this.r), Fn.toBytes(this.s));
  		            if (format === 'der')
  		                return (0, utils_ts_1.hexToBytes)(exports.DER.hexFromSig(this));
  		            throw new Error('invalid format');
  		        }
  		        toHex(format) {
  		            return (0, utils_ts_1.bytesToHex)(this.toBytes(format));
  		        }
  		        // TODO: remove
  		        assertValidity() { }
  		        static fromCompact(hex) {
  		            return Signature.fromBytes((0, utils_ts_1.ensureBytes)('sig', hex), 'compact');
  		        }
  		        static fromDER(hex) {
  		            return Signature.fromBytes((0, utils_ts_1.ensureBytes)('sig', hex), 'der');
  		        }
  		        toDERRawBytes() {
  		            return this.toBytes('der');
  		        }
  		        toDERHex() {
  		            return (0, utils_ts_1.bytesToHex)(this.toBytes('der'));
  		        }
  		        toCompactRawBytes() {
  		            return this.toBytes('compact');
  		        }
  		        toCompactHex() {
  		            return (0, utils_ts_1.bytesToHex)(this.toBytes('compact'));
  		        }
  		    }
  		    function isValidSecretKey(privateKey) {
  		        try {
  		            return !!_normFnElement(Fn, privateKey);
  		        }
  		        catch (error) {
  		            return false;
  		        }
  		    }
  		    function isValidPublicKey(publicKey, isCompressed) {
  		        try {
  		            const l = publicKey.length;
  		            if (isCompressed === true && l !== lengths.public)
  		                return false;
  		            if (isCompressed === false && l !== lengths.publicUncompressed)
  		                return false;
  		            return !!Point.fromBytes(publicKey);
  		        }
  		        catch (error) {
  		            return false;
  		        }
  		    }
  		    /**
  		     * Produces cryptographically secure secret key from random of size
  		     * (groupLen + ceil(groupLen / 2)) with modulo bias being negligible.
  		     */
  		    function randomSecretKey(seed = randomBytes_(seedLen)) {
  		        return (0, modular_ts_1.mapHashToField)(seed, CURVE_ORDER);
  		    }
  		    const utils = {
  		        isValidSecretKey,
  		        isValidPublicKey,
  		        randomSecretKey,
  		        // TODO: remove
  		        isValidPrivateKey: isValidSecretKey,
  		        randomPrivateKey: randomSecretKey,
  		        normPrivateKeyToScalar: (key) => _normFnElement(Fn, key),
  		        precompute(windowSize = 8, point = Point.BASE) {
  		            return point.precompute(windowSize, false);
  		        },
  		    };
  		    /**
  		     * Computes public key for a secret key. Checks for validity of the secret key.
  		     * @param isCompressed whether to return compact (default), or full key
  		     * @returns Public key, full when isCompressed=false; short when isCompressed=true
  		     */
  		    function getPublicKey(secretKey, isCompressed = true) {
  		        return Point.BASE.multiply(_normFnElement(Fn, secretKey)).toBytes(isCompressed);
  		    }
  		    /**
  		     * Quick and dirty check for item being public key. Does not validate hex, or being on-curve.
  		     */
  		    function isProbPub(item) {
  		        // TODO: remove
  		        if (typeof item === 'bigint')
  		            return false;
  		        // TODO: remove
  		        if (item instanceof Point)
  		            return true;
  		        if (Fn.allowedLengths || lengths.secret === lengths.public)
  		            return undefined;
  		        const l = (0, utils_ts_1.ensureBytes)('key', item).length;
  		        return l === lengths.public || l === lengths.publicUncompressed;
  		    }
  		    /**
  		     * ECDH (Elliptic Curve Diffie Hellman).
  		     * Computes shared public key from secret key A and public key B.
  		     * Checks: 1) secret key validity 2) shared key is on-curve.
  		     * Does NOT hash the result.
  		     * @param isCompressed whether to return compact (default), or full key
  		     * @returns shared public key
  		     */
  		    function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
  		        if (isProbPub(secretKeyA) === true)
  		            throw new Error('first arg must be private key');
  		        if (isProbPub(publicKeyB) === false)
  		            throw new Error('second arg must be public key');
  		        const s = _normFnElement(Fn, secretKeyA);
  		        const b = Point.fromHex(publicKeyB); // checks for being on-curve
  		        return b.multiply(s).toBytes(isCompressed);
  		    }
  		    // RFC6979: ensure ECDSA msg is X bytes and < N. RFC suggests optional truncating via bits2octets.
  		    // FIPS 186-4 4.6 suggests the leftmost min(nBitLen, outLen) bits, which matches bits2int.
  		    // bits2int can produce res>N, we can do mod(res, N) since the bitLen is the same.
  		    // int2octets can't be used; pads small msgs with 0: unacceptatble for trunc as per RFC vectors
  		    const bits2int = ecdsaOpts.bits2int ||
  		        function (bytes) {
  		            // Our custom check "just in case", for protection against DoS
  		            if (bytes.length > 8192)
  		                throw new Error('input is too large');
  		            // For curves with nBitLength % 8 !== 0: bits2octets(bits2octets(m)) !== bits2octets(m)
  		            // for some cases, since bytes.length * 8 is not actual bitLength.
  		            const num = (0, utils_ts_1.bytesToNumberBE)(bytes); // check for == u8 done here
  		            const delta = bytes.length * 8 - fnBits; // truncate to nBitLength leftmost bits
  		            return delta > 0 ? num >> BigInt(delta) : num;
  		        };
  		    const bits2int_modN = ecdsaOpts.bits2int_modN ||
  		        function (bytes) {
  		            return Fn.create(bits2int(bytes)); // can't use bytesToNumberBE here
  		        };
  		    // NOTE: pads output with zero as per spec
  		    const ORDER_MASK = (0, utils_ts_1.bitMask)(fnBits);
  		    /**
  		     * Converts to bytes. Checks if num in `[0..ORDER_MASK-1]` e.g.: `[0..2^256-1]`.
  		     */
  		    function int2octets(num) {
  		        // IMPORTANT: the check ensures working for case `Fn.BYTES != Fn.BITS * 8`
  		        (0, utils_ts_1.aInRange)('num < 2^' + fnBits, num, _0n, ORDER_MASK);
  		        return Fn.toBytes(num);
  		    }
  		    // Steps A, D of RFC6979 3.2
  		    // Creates RFC6979 seed; converts msg/privKey to numbers.
  		    // Used only in sign, not in verify.
  		    // NOTE: we cannot assume here that msgHash has same amount of bytes as curve order,
  		    // this will be invalid at least for P521. Also it can be bigger for P224 + SHA256
  		    function prepSig(msgHash, privateKey, opts = defaultSigOpts) {
  		        if (['recovered', 'canonical'].some((k) => k in opts))
  		            throw new Error('sign() legacy options not supported');
  		        let { lowS, prehash, extraEntropy: ent } = opts; // generates low-s sigs by default
  		        if (lowS == null)
  		            lowS = true; // RFC6979 3.2: we skip step A, because we already provide hash
  		        msgHash = (0, utils_ts_1.ensureBytes)('msgHash', msgHash);
  		        validateSigVerOpts(opts);
  		        if (prehash)
  		            msgHash = (0, utils_ts_1.ensureBytes)('prehashed msgHash', hash(msgHash));
  		        // We can't later call bits2octets, since nested bits2int is broken for curves
  		        // with fnBits % 8 !== 0. Because of that, we unwrap it here as int2octets call.
  		        // const bits2octets = (bits) => int2octets(bits2int_modN(bits))
  		        const h1int = bits2int_modN(msgHash);
  		        const d = _normFnElement(Fn, privateKey); // validate secret key, convert to bigint
  		        const seedArgs = [int2octets(d), int2octets(h1int)];
  		        // extraEntropy. RFC6979 3.6: additional k' (optional).
  		        if (ent != null && ent !== false) {
  		            // K = HMAC_K(V || 0x00 || int2octets(x) || bits2octets(h1) || k')
  		            const e = ent === true ? randomBytes_(lengths.secret) : ent; // gen random bytes OR pass as-is
  		            seedArgs.push((0, utils_ts_1.ensureBytes)('extraEntropy', e)); // check for being bytes
  		        }
  		        const seed = (0, utils_ts_1.concatBytes)(...seedArgs); // Step D of RFC6979 3.2
  		        const m = h1int; // NOTE: no need to call bits2int second time here, it is inside truncateHash!
  		        // Converts signature params into point w r/s, checks result for validity.
  		        // To transform k => Signature:
  		        // q = k⋅G
  		        // r = q.x mod n
  		        // s = k^-1(m + rd) mod n
  		        // Can use scalar blinding b^-1(bm + bdr) where b ∈ [1,q−1] according to
  		        // https://tches.iacr.org/index.php/TCHES/article/view/7337/6509. We've decided against it:
  		        // a) dependency on CSPRNG b) 15% slowdown c) doesn't really help since bigints are not CT
  		        function k2sig(kBytes) {
  		            // RFC 6979 Section 3.2, step 3: k = bits2int(T)
  		            // Important: all mod() calls here must be done over N
  		            const k = bits2int(kBytes); // Cannot use fields methods, since it is group element
  		            if (!Fn.isValidNot0(k))
  		                return; // Valid scalars (including k) must be in 1..N-1
  		            const ik = Fn.inv(k); // k^-1 mod n
  		            const q = Point.BASE.multiply(k).toAffine(); // q = k⋅G
  		            const r = Fn.create(q.x); // r = q.x mod n
  		            if (r === _0n)
  		                return;
  		            const s = Fn.create(ik * Fn.create(m + r * d)); // Not using blinding here, see comment above
  		            if (s === _0n)
  		                return;
  		            let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n); // recovery bit (2 or 3, when q.x > n)
  		            let normS = s;
  		            if (lowS && isBiggerThanHalfOrder(s)) {
  		                normS = normalizeS(s); // if lowS was passed, ensure s is always
  		                recovery ^= 1; // // in the bottom half of N
  		            }
  		            return new Signature(r, normS, recovery); // use normS, not s
  		        }
  		        return { seed, k2sig };
  		    }
  		    const defaultSigOpts = { lowS: ecdsaOpts.lowS, prehash: false };
  		    const defaultVerOpts = { lowS: ecdsaOpts.lowS, prehash: false };
  		    /**
  		     * Signs message hash with a secret key.
  		     * ```
  		     * sign(m, d, k) where
  		     *   (x, y) = G × k
  		     *   r = x mod n
  		     *   s = (m + dr)/k mod n
  		     * ```
  		     */
  		    function sign(msgHash, secretKey, opts = defaultSigOpts) {
  		        const { seed, k2sig } = prepSig(msgHash, secretKey, opts); // Steps A, D of RFC6979 3.2.
  		        const drbg = (0, utils_ts_1.createHmacDrbg)(hash.outputLen, Fn.BYTES, hmac_);
  		        return drbg(seed, k2sig); // Steps B, C, D, E, F, G
  		    }
  		    // Enable precomputes. Slows down first publicKey computation by 20ms.
  		    Point.BASE.precompute(8);
  		    /**
  		     * Verifies a signature against message hash and public key.
  		     * Rejects lowS signatures by default: to override,
  		     * specify option `{lowS: false}`. Implements section 4.1.4 from https://www.secg.org/sec1-v2.pdf:
  		     *
  		     * ```
  		     * verify(r, s, h, P) where
  		     *   U1 = hs^-1 mod n
  		     *   U2 = rs^-1 mod n
  		     *   R = U1⋅G - U2⋅P
  		     *   mod(R.x, n) == r
  		     * ```
  		     */
  		    function verify(signature, msgHash, publicKey, opts = defaultVerOpts) {
  		        const sg = signature;
  		        msgHash = (0, utils_ts_1.ensureBytes)('msgHash', msgHash);
  		        publicKey = (0, utils_ts_1.ensureBytes)('publicKey', publicKey);
  		        // Verify opts
  		        validateSigVerOpts(opts);
  		        const { lowS, prehash, format } = opts;
  		        // TODO: remove
  		        if ('strict' in opts)
  		            throw new Error('options.strict was renamed to lowS');
  		        let _sig = undefined;
  		        let P;
  		        if (format === undefined) {
  		            // Try to deduce format
  		            const isHex = typeof sg === 'string' || (0, utils_ts_1.isBytes)(sg);
  		            const isObj = !isHex &&
  		                sg !== null &&
  		                typeof sg === 'object' &&
  		                typeof sg.r === 'bigint' &&
  		                typeof sg.s === 'bigint';
  		            if (!isHex && !isObj)
  		                throw new Error('invalid signature, expected Uint8Array, hex string or Signature instance');
  		            if (isObj) {
  		                _sig = new Signature(sg.r, sg.s);
  		            }
  		            else if (isHex) {
  		                // TODO: remove this malleable check
  		                // Signature can be represented in 2 ways: compact (2*Fn.BYTES) & DER (variable-length).
  		                // Since DER can also be 2*Fn.BYTES bytes, we check for it first.
  		                try {
  		                    _sig = Signature.fromDER(sg);
  		                }
  		                catch (derError) {
  		                    if (!(derError instanceof exports.DER.Err))
  		                        throw derError;
  		                }
  		                if (!_sig) {
  		                    try {
  		                        _sig = Signature.fromCompact(sg);
  		                    }
  		                    catch (error) {
  		                        return false;
  		                    }
  		                }
  		            }
  		        }
  		        else {
  		            if (format === 'compact' || format === 'der') {
  		                if (typeof sg !== 'string' && !(0, utils_ts_1.isBytes)(sg))
  		                    throw new Error('"der" / "compact" format expects Uint8Array signature');
  		                _sig = Signature.fromBytes((0, utils_ts_1.ensureBytes)('sig', sg), format);
  		            }
  		            else if (format === 'js') {
  		                if (!(sg instanceof Signature))
  		                    throw new Error('"js" format expects Signature instance');
  		                _sig = sg;
  		            }
  		            else {
  		                throw new Error('format must be "compact", "der" or "js"');
  		            }
  		        }
  		        if (!_sig)
  		            return false;
  		        try {
  		            P = Point.fromHex(publicKey);
  		            if (lowS && _sig.hasHighS())
  		                return false;
  		            // todo: optional.hash => hash
  		            if (prehash)
  		                msgHash = hash(msgHash);
  		            const { r, s } = _sig;
  		            const h = bits2int_modN(msgHash); // Cannot use fields methods, since it is group element
  		            const is = Fn.inv(s); // s^-1
  		            const u1 = Fn.create(h * is); // u1 = hs^-1 mod n
  		            const u2 = Fn.create(r * is); // u2 = rs^-1 mod n
  		            const R = Point.BASE.multiplyUnsafe(u1).add(P.multiplyUnsafe(u2));
  		            if (R.is0())
  		                return false;
  		            const v = Fn.create(R.x); // v = r.x mod n
  		            return v === r;
  		        }
  		        catch (e) {
  		            return false;
  		        }
  		    }
  		    function keygen(seed) {
  		        const secretKey = utils.randomSecretKey(seed);
  		        return { secretKey, publicKey: getPublicKey(secretKey) };
  		    }
  		    return Object.freeze({
  		        keygen,
  		        getPublicKey,
  		        sign,
  		        verify,
  		        getSharedSecret,
  		        utils,
  		        Point,
  		        Signature,
  		        info: { type: 'weierstrass', lengths, publicKeyHasPrefix: true },
  		    });
  		}
  		// TODO: remove
  		function _weierstrass_legacy_opts_to_new(c) {
  		    const CURVE = {
  		        a: c.a,
  		        b: c.b,
  		        p: c.Fp.ORDER,
  		        n: c.n,
  		        h: c.h,
  		        Gx: c.Gx,
  		        Gy: c.Gy,
  		    };
  		    const Fp = c.Fp;
  		    let allowedLengths = c.allowedPrivateKeyLengths
  		        ? Array.from(new Set(c.allowedPrivateKeyLengths.map((l) => Math.ceil(l / 2))))
  		        : undefined;
  		    const Fn = (0, modular_ts_1.Field)(CURVE.n, {
  		        BITS: c.nBitLength,
  		        allowedLengths: allowedLengths,
  		        modOnDecode: c.wrapPrivateKey,
  		    });
  		    const curveOpts = {
  		        Fp,
  		        Fn,
  		        allowInfinityPoint: c.allowInfinityPoint,
  		        endo: c.endo,
  		        isTorsionFree: c.isTorsionFree,
  		        clearCofactor: c.clearCofactor,
  		        fromBytes: c.fromBytes,
  		        toBytes: c.toBytes,
  		    };
  		    return { CURVE, curveOpts };
  		}
  		function _ecdsa_legacy_opts_to_new(c) {
  		    const { CURVE, curveOpts } = _weierstrass_legacy_opts_to_new(c);
  		    const ecdsaOpts = {
  		        hmac: c.hmac,
  		        randomBytes: c.randomBytes,
  		        lowS: c.lowS,
  		        bits2int: c.bits2int,
  		        bits2int_modN: c.bits2int_modN,
  		    };
  		    return { CURVE, curveOpts, hash: c.hash, ecdsaOpts };
  		}
  		// TODO: remove
  		function _weierstrass_new_output_to_legacy(c, Point) {
  		    const { Fp, Fn } = Point;
  		    // TODO: remove
  		    function isWithinCurveOrder(num) {
  		        return (0, utils_ts_1.inRange)(num, _1n, Fn.ORDER);
  		    }
  		    const weierstrassEquation = _legacyHelperEquat(Fp, c.a, c.b);
  		    return Object.assign({}, {
  		        CURVE: c,
  		        Point: Point,
  		        ProjectivePoint: Point,
  		        normPrivateKeyToScalar: (key) => _normFnElement(Fn, key),
  		        weierstrassEquation,
  		        isWithinCurveOrder,
  		    });
  		}
  		// TODO: remove
  		function _ecdsa_new_output_to_legacy(c, ecdsa) {
  		    return Object.assign({}, ecdsa, {
  		        ProjectivePoint: ecdsa.Point,
  		        CURVE: c,
  		    });
  		}
  		// _ecdsa_legacy
  		function weierstrass(c) {
  		    const { CURVE, curveOpts, hash, ecdsaOpts } = _ecdsa_legacy_opts_to_new(c);
  		    const Point = weierstrassN(CURVE, curveOpts);
  		    const signs = ecdsa(Point, hash, ecdsaOpts);
  		    return _ecdsa_new_output_to_legacy(c, signs);
  		}
  		
  	} (weierstrass));
  	return weierstrass;
  }

  var hasRequired_shortw_utils;

  function require_shortw_utils () {
  	if (hasRequired_shortw_utils) return _shortw_utils;
  	hasRequired_shortw_utils = 1;
  	Object.defineProperty(_shortw_utils, "__esModule", { value: true });
  	_shortw_utils.getHash = getHash;
  	_shortw_utils.createCurve = createCurve;
  	/**
  	 * Utilities for short weierstrass curves, combined with noble-hashes.
  	 * @module
  	 */
  	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  	const weierstrass_ts_1 = /*@__PURE__*/ requireWeierstrass();
  	/** connects noble-curves to noble-hashes */
  	function getHash(hash) {
  	    return { hash };
  	}
  	/** @deprecated use new `weierstrass()` and `ecdsa()` methods */
  	function createCurve(curveDef, defHash) {
  	    const create = (hash) => (0, weierstrass_ts_1.weierstrass)({ ...curveDef, hash: hash });
  	    return { ...create(defHash), create };
  	}
  	
  	return _shortw_utils;
  }

  var hasRequiredSecp256k1;

  function requireSecp256k1 () {
  	if (hasRequiredSecp256k1) return secp256k1;
  	hasRequiredSecp256k1 = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.encodeToCurve = exports.hashToCurve = exports.secp256k1_hasher = exports.schnorr = exports.secp256k1 = void 0;
  		/**
  		 * SECG secp256k1. See [pdf](https://www.secg.org/sec2-v2.pdf).
  		 *
  		 * Belongs to Koblitz curves: it has efficiently-computable GLV endomorphism ψ,
  		 * check out {@link EndomorphismOpts}. Seems to be rigid (not backdoored).
  		 * @module
  		 */
  		/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  		const sha2_js_1 = /*@__PURE__*/ requireSha2();
  		const utils_js_1 = /*@__PURE__*/ requireUtils$2();
  		const _shortw_utils_ts_1 = /*@__PURE__*/ require_shortw_utils();
  		const hash_to_curve_ts_1 = /*@__PURE__*/ requireHashToCurve();
  		const modular_ts_1 = /*@__PURE__*/ requireModular();
  		const weierstrass_ts_1 = /*@__PURE__*/ requireWeierstrass();
  		const utils_ts_1 = /*@__PURE__*/ requireUtils$1();
  		// Seems like generator was produced from some seed:
  		// `Point.BASE.multiply(Point.Fn.inv(2n, N)).toAffine().x`
  		// // gives short x 0x3b78ce563f89a0ed9414f5aa28ad0d96d6795f9c63n
  		const secp256k1_CURVE = {
  		    p: BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
  		    n: BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
  		    h: BigInt(1),
  		    a: BigInt(0),
  		    b: BigInt(7),
  		    Gx: BigInt('0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
  		    Gy: BigInt('0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'),
  		};
  		const secp256k1_ENDO = {
  		    beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
  		    basises: [
  		        [BigInt('0x3086d221a7d46bcde86c90e49284eb15'), -BigInt('0xe4437ed6010e88286f547fa90abfe4c3')],
  		        [BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8'), BigInt('0x3086d221a7d46bcde86c90e49284eb15')],
  		    ],
  		};
  		const _0n = /* @__PURE__ */ BigInt(0);
  		const _1n = /* @__PURE__ */ BigInt(1);
  		const _2n = /* @__PURE__ */ BigInt(2);
  		/**
  		 * √n = n^((p+1)/4) for fields p = 3 mod 4. We unwrap the loop and multiply bit-by-bit.
  		 * (P+1n/4n).toString(2) would produce bits [223x 1, 0, 22x 1, 4x 0, 11, 00]
  		 */
  		function sqrtMod(y) {
  		    const P = secp256k1_CURVE.p;
  		    // prettier-ignore
  		    const _3n = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  		    // prettier-ignore
  		    const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  		    const b2 = (y * y * y) % P; // x^3, 11
  		    const b3 = (b2 * b2 * y) % P; // x^7
  		    const b6 = ((0, modular_ts_1.pow2)(b3, _3n, P) * b3) % P;
  		    const b9 = ((0, modular_ts_1.pow2)(b6, _3n, P) * b3) % P;
  		    const b11 = ((0, modular_ts_1.pow2)(b9, _2n, P) * b2) % P;
  		    const b22 = ((0, modular_ts_1.pow2)(b11, _11n, P) * b11) % P;
  		    const b44 = ((0, modular_ts_1.pow2)(b22, _22n, P) * b22) % P;
  		    const b88 = ((0, modular_ts_1.pow2)(b44, _44n, P) * b44) % P;
  		    const b176 = ((0, modular_ts_1.pow2)(b88, _88n, P) * b88) % P;
  		    const b220 = ((0, modular_ts_1.pow2)(b176, _44n, P) * b44) % P;
  		    const b223 = ((0, modular_ts_1.pow2)(b220, _3n, P) * b3) % P;
  		    const t1 = ((0, modular_ts_1.pow2)(b223, _23n, P) * b22) % P;
  		    const t2 = ((0, modular_ts_1.pow2)(t1, _6n, P) * b2) % P;
  		    const root = (0, modular_ts_1.pow2)(t2, _2n, P);
  		    if (!Fpk1.eql(Fpk1.sqr(root), y))
  		        throw new Error('Cannot find square root');
  		    return root;
  		}
  		const Fpk1 = (0, modular_ts_1.Field)(secp256k1_CURVE.p, undefined, undefined, { sqrt: sqrtMod });
  		/**
  		 * secp256k1 curve, ECDSA and ECDH methods.
  		 *
  		 * Field: `2n**256n - 2n**32n - 2n**9n - 2n**8n - 2n**7n - 2n**6n - 2n**4n - 1n`
  		 *
  		 * @example
  		 * ```js
  		 * import { secp256k1 } from '@noble/curves/secp256k1';
  		 * const { secretKey, publicKey } = secp256k1.keygen();
  		 * const msg = new TextEncoder().encode('hello');
  		 * const sig = secp256k1.sign(msg, secretKey);
  		 * const isValid = secp256k1.verify(sig, msg, publicKey) === true;
  		 * ```
  		 */
  		exports.secp256k1 = (0, _shortw_utils_ts_1.createCurve)({ ...secp256k1_CURVE, Fp: Fpk1, lowS: true, endo: secp256k1_ENDO }, sha2_js_1.sha256);
  		// Schnorr signatures are superior to ECDSA from above. Below is Schnorr-specific BIP0340 code.
  		// https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
  		/** An object mapping tags to their tagged hash prefix of [SHA256(tag) | SHA256(tag)] */
  		const TAGGED_HASH_PREFIXES = {};
  		function taggedHash(tag, ...messages) {
  		    let tagP = TAGGED_HASH_PREFIXES[tag];
  		    if (tagP === undefined) {
  		        const tagH = (0, sha2_js_1.sha256)(Uint8Array.from(tag, (c) => c.charCodeAt(0)));
  		        tagP = (0, utils_ts_1.concatBytes)(tagH, tagH);
  		        TAGGED_HASH_PREFIXES[tag] = tagP;
  		    }
  		    return (0, sha2_js_1.sha256)((0, utils_ts_1.concatBytes)(tagP, ...messages));
  		}
  		// ECDSA compact points are 33-byte. Schnorr is 32: we strip first byte 0x02 or 0x03
  		const pointToBytes = (point) => point.toBytes(true).slice(1);
  		const numTo32b = (n) => (0, utils_ts_1.numberToBytesBE)(n, 32);
  		const modP = (x) => (0, modular_ts_1.mod)(x, secp256k1_CURVE.p);
  		const modN = (x) => (0, modular_ts_1.mod)(x, secp256k1_CURVE.n);
  		const Point = /* @__PURE__ */ (() => exports.secp256k1.Point)();
  		const hasEven = (y) => y % _2n === _0n;
  		// Calculate point, scalar and bytes
  		function schnorrGetExtPubKey(priv) {
  		    // TODO: replace with Point.Fn.fromBytes(priv)
  		    let d_ = (0, weierstrass_ts_1._normFnElement)(Point.Fn, priv);
  		    let p = Point.BASE.multiply(d_); // P = d'⋅G; 0 < d' < n check is done inside
  		    const scalar = hasEven(p.y) ? d_ : modN(-d_);
  		    return { scalar, bytes: pointToBytes(p) };
  		}
  		/**
  		 * lift_x from BIP340. Convert 32-byte x coordinate to elliptic curve point.
  		 * @returns valid point checked for being on-curve
  		 */
  		function lift_x(x) {
  		    (0, utils_ts_1.aInRange)('x', x, _1n, secp256k1_CURVE.p); // Fail if x ≥ p.
  		    const xx = modP(x * x);
  		    const c = modP(xx * x + BigInt(7)); // Let c = x³ + 7 mod p.
  		    let y = sqrtMod(c); // Let y = c^(p+1)/4 mod p.
  		    if (!hasEven(y))
  		        y = modP(-y); // Return the unique point P such that x(P) = x and
  		    const p = Point.fromAffine({ x, y }); // y(P) = y if y mod 2 = 0 or y(P) = p-y otherwise.
  		    p.assertValidity();
  		    return p;
  		}
  		const num = utils_ts_1.bytesToNumberBE;
  		/**
  		 * Create tagged hash, convert it to bigint, reduce modulo-n.
  		 */
  		function challenge(...args) {
  		    return modN(num(taggedHash('BIP0340/challenge', ...args)));
  		}
  		/**
  		 * Schnorr public key is just `x` coordinate of Point as per BIP340.
  		 */
  		function schnorrGetPublicKey(secretKey) {
  		    return schnorrGetExtPubKey(secretKey).bytes; // d'=int(sk). Fail if d'=0 or d'≥n. Ret bytes(d'⋅G)
  		}
  		/**
  		 * Creates Schnorr signature as per BIP340. Verifies itself before returning anything.
  		 * auxRand is optional and is not the sole source of k generation: bad CSPRNG won't be dangerous.
  		 */
  		function schnorrSign(message, secretKey, auxRand = (0, utils_js_1.randomBytes)(32)) {
  		    const m = (0, utils_ts_1.ensureBytes)('message', message);
  		    const { bytes: px, scalar: d } = schnorrGetExtPubKey(secretKey); // checks for isWithinCurveOrder
  		    const a = (0, utils_ts_1.ensureBytes)('auxRand', auxRand, 32); // Auxiliary random data a: a 32-byte array
  		    const t = numTo32b(d ^ num(taggedHash('BIP0340/aux', a))); // Let t be the byte-wise xor of bytes(d) and hash/aux(a)
  		    const rand = taggedHash('BIP0340/nonce', t, px, m); // Let rand = hash/nonce(t || bytes(P) || m)
  		    const k_ = modN(num(rand)); // Let k' = int(rand) mod n
  		    if (k_ === _0n)
  		        throw new Error('sign failed: k is zero'); // Fail if k' = 0.
  		    const { bytes: rx, scalar: k } = schnorrGetExtPubKey(k_); // Let R = k'⋅G.
  		    const e = challenge(rx, px, m); // Let e = int(hash/challenge(bytes(R) || bytes(P) || m)) mod n.
  		    const sig = new Uint8Array(64); // Let sig = bytes(R) || bytes((k + ed) mod n).
  		    sig.set(rx, 0);
  		    sig.set(numTo32b(modN(k + e * d)), 32);
  		    // If Verify(bytes(P), m, sig) (see below) returns failure, abort
  		    if (!schnorrVerify(sig, m, px))
  		        throw new Error('sign: Invalid signature produced');
  		    return sig;
  		}
  		/**
  		 * Verifies Schnorr signature.
  		 * Will swallow errors & return false except for initial type validation of arguments.
  		 */
  		function schnorrVerify(signature, message, publicKey) {
  		    const sig = (0, utils_ts_1.ensureBytes)('signature', signature, 64);
  		    const m = (0, utils_ts_1.ensureBytes)('message', message);
  		    const pub = (0, utils_ts_1.ensureBytes)('publicKey', publicKey, 32);
  		    try {
  		        const P = lift_x(num(pub)); // P = lift_x(int(pk)); fail if that fails
  		        const r = num(sig.subarray(0, 32)); // Let r = int(sig[0:32]); fail if r ≥ p.
  		        if (!(0, utils_ts_1.inRange)(r, _1n, secp256k1_CURVE.p))
  		            return false;
  		        const s = num(sig.subarray(32, 64)); // Let s = int(sig[32:64]); fail if s ≥ n.
  		        if (!(0, utils_ts_1.inRange)(s, _1n, secp256k1_CURVE.n))
  		            return false;
  		        const e = challenge(numTo32b(r), pointToBytes(P), m); // int(challenge(bytes(r)||bytes(P)||m))%n
  		        // R = s⋅G - e⋅P, where -eP == (n-e)P
  		        const R = Point.BASE.multiplyUnsafe(s).add(P.multiplyUnsafe(modN(-e)));
  		        const { x, y } = R.toAffine();
  		        // Fail if is_infinite(R) / not has_even_y(R) / x(R) ≠ r.
  		        if (R.is0() || !hasEven(y) || x !== r)
  		            return false;
  		        return true;
  		    }
  		    catch (error) {
  		        return false;
  		    }
  		}
  		/**
  		 * Schnorr signatures over secp256k1.
  		 * https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
  		 * @example
  		 * ```js
  		 * import { schnorr } from '@noble/curves/secp256k1';
  		 * const { secretKey, publicKey } = schnorr.keygen();
  		 * // const publicKey = schnorr.getPublicKey(secretKey);
  		 * const msg = new TextEncoder().encode('hello');
  		 * const sig = schnorr.sign(msg, secretKey);
  		 * const isValid = schnorr.verify(sig, msg, publicKey);
  		 * ```
  		 */
  		exports.schnorr = (() => {
  		    const size = 32;
  		    const seedLength = 48;
  		    const randomSecretKey = (seed = (0, utils_js_1.randomBytes)(seedLength)) => {
  		        return (0, modular_ts_1.mapHashToField)(seed, secp256k1_CURVE.n);
  		    };
  		    // TODO: remove
  		    exports.secp256k1.utils.randomSecretKey;
  		    function keygen(seed) {
  		        const secretKey = randomSecretKey(seed);
  		        return { secretKey, publicKey: schnorrGetPublicKey(secretKey) };
  		    }
  		    return {
  		        keygen,
  		        getPublicKey: schnorrGetPublicKey,
  		        sign: schnorrSign,
  		        verify: schnorrVerify,
  		        Point,
  		        utils: {
  		            randomSecretKey: randomSecretKey,
  		            randomPrivateKey: randomSecretKey,
  		            taggedHash,
  		            // TODO: remove
  		            lift_x,
  		            pointToBytes,
  		            numberToBytesBE: utils_ts_1.numberToBytesBE,
  		            bytesToNumberBE: utils_ts_1.bytesToNumberBE,
  		            mod: modular_ts_1.mod,
  		        },
  		        info: {
  		            type: 'weierstrass',
  		            publicKeyHasPrefix: false,
  		            lengths: {
  		                secret: size,
  		                public: size,
  		                signature: size * 2,
  		                seed: seedLength,
  		            },
  		        },
  		    };
  		})();
  		const isoMap = /* @__PURE__ */ (() => (0, hash_to_curve_ts_1.isogenyMap)(Fpk1, [
  		    // xNum
  		    [
  		        '0x8e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38daaaaa8c7',
  		        '0x7d3d4c80bc321d5b9f315cea7fd44c5d595d2fc0bf63b92dfff1044f17c6581',
  		        '0x534c328d23f234e6e2a413deca25caece4506144037c40314ecbd0b53d9dd262',
  		        '0x8e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38daaaaa88c',
  		    ],
  		    // xDen
  		    [
  		        '0xd35771193d94918a9ca34ccbb7b640dd86cd409542f8487d9fe6b745781eb49b',
  		        '0xedadc6f64383dc1df7c4b2d51b54225406d36b641f5e41bbc52a56612a8c6d14',
  		        '0x0000000000000000000000000000000000000000000000000000000000000001', // LAST 1
  		    ],
  		    // yNum
  		    [
  		        '0x4bda12f684bda12f684bda12f684bda12f684bda12f684bda12f684b8e38e23c',
  		        '0xc75e0c32d5cb7c0fa9d0a54b12a0a6d5647ab046d686da6fdffc90fc201d71a3',
  		        '0x29a6194691f91a73715209ef6512e576722830a201be2018a765e85a9ecee931',
  		        '0x2f684bda12f684bda12f684bda12f684bda12f684bda12f684bda12f38e38d84',
  		    ],
  		    // yDen
  		    [
  		        '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffff93b',
  		        '0x7a06534bb8bdb49fd5e9e6632722c2989467c1bfc8e8d978dfb425d2685c2573',
  		        '0x6484aa716545ca2cf3a70c3fa8fe337e0a3d21162f0d6299a7bf8192bfd2a76f',
  		        '0x0000000000000000000000000000000000000000000000000000000000000001', // LAST 1
  		    ],
  		].map((i) => i.map((j) => BigInt(j)))))();
  		const mapSWU = /* @__PURE__ */ (() => (0, weierstrass_ts_1.mapToCurveSimpleSWU)(Fpk1, {
  		    A: BigInt('0x3f8731abdd661adca08a5558f0f5d272e953d363cb6f0e5d405447c01a444533'),
  		    B: BigInt('1771'),
  		    Z: Fpk1.create(BigInt('-11')),
  		}))();
  		/** Hashing / encoding to secp256k1 points / field. RFC 9380 methods. */
  		exports.secp256k1_hasher = (() => (0, hash_to_curve_ts_1.createHasher)(exports.secp256k1.Point, (scalars) => {
  		    const { x, y } = mapSWU(Fpk1.create(scalars[0]));
  		    return isoMap(x, y);
  		}, {
  		    DST: 'secp256k1_XMD:SHA-256_SSWU_RO_',
  		    encodeDST: 'secp256k1_XMD:SHA-256_SSWU_NU_',
  		    p: Fpk1.ORDER,
  		    m: 1,
  		    k: 128,
  		    expand: 'xmd',
  		    hash: sha2_js_1.sha256,
  		}))();
  		/** @deprecated use `import { secp256k1_hasher } from '@noble/curves/secp256k1.js';` */
  		exports.hashToCurve = (() => exports.secp256k1_hasher.hashToCurve)();
  		/** @deprecated use `import { secp256k1_hasher } from '@noble/curves/secp256k1.js';` */
  		exports.encodeToCurve = (() => exports.secp256k1_hasher.encodeToCurve)();
  		
  	} (secp256k1));
  	return secp256k1;
  }

  var hex = {};

  var hasRequiredHex;

  function requireHex () {
  	if (hasRequiredHex) return hex;
  	hasRequiredHex = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.decodeHex = exports.remove0x = void 0;
  		var utils_1 = /*@__PURE__*/ requireUtils$3();
  		var remove0x = function (hex) {
  		    return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  		};
  		exports.remove0x = remove0x;
  		var decodeHex = function (hex) { return (0, utils_1.hexToBytes)((0, exports.remove0x)(hex)); };
  		exports.decodeHex = decodeHex; 
  	} (hex));
  	return hex;
  }

  var hasRequiredElliptic;

  function requireElliptic () {
  	if (hasRequiredElliptic) return elliptic;
  	hasRequiredElliptic = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.hexToPublicKey = exports.convertPublicKeyFormat = exports.getSharedPoint = exports.getPublicKey = exports.isValidPrivateKey = exports.getValidSecret = void 0;
  		var webcrypto_1 = /*@__PURE__*/ requireWebcrypto();
  		var ed25519_1 = /*@__PURE__*/ requireEd25519();
  		var secp256k1_1 = /*@__PURE__*/ requireSecp256k1();
  		var config_1 = requireConfig();
  		var consts_1 = requireConsts();
  		var hex_1 = requireHex();
  		// TODO: remove `ellipticCurve` after 0.5.0
  		var getValidSecret = function (curve) {
  		    var key;
  		    do {
  		        key = (0, webcrypto_1.randomBytes)(consts_1.SECRET_KEY_LENGTH);
  		    } while (!(0, exports.isValidPrivateKey)(key, curve));
  		    return key;
  		};
  		exports.getValidSecret = getValidSecret;
  		var isValidPrivateKey = function (secret, curve) {
  		    // on secp256k1: only key ∈ (0, group order) is valid
  		    // on curve25519: any 32-byte key is valid
  		    return _exec(curve || (0, config_1.ellipticCurve)(), function (curve) { return curve.utils.isValidPrivateKey(secret); }, function () { return true; }, function () { return true; });
  		};
  		exports.isValidPrivateKey = isValidPrivateKey;
  		var getPublicKey = function (secret, curve) {
  		    return _exec(curve || (0, config_1.ellipticCurve)(), function (curve) { return curve.getPublicKey(secret); }, function (curve) { return curve.getPublicKey(secret); }, function (curve) { return curve.getPublicKey(secret); });
  		};
  		exports.getPublicKey = getPublicKey;
  		var getSharedPoint = function (sk, pk, compressed, curve) {
  		    return _exec(curve || (0, config_1.ellipticCurve)(), function (curve) { return curve.getSharedSecret(sk, pk, compressed); }, function (curve) { return curve.getSharedSecret(sk, pk); }, function (curve) { return getSharedPointOnEd25519(curve, sk, pk); });
  		};
  		exports.getSharedPoint = getSharedPoint;
  		var convertPublicKeyFormat = function (pk, compressed, curve) {
  		    // only for secp256k1
  		    return _exec(curve || (0, config_1.ellipticCurve)(), function (curve) { return curve.getSharedSecret(BigInt(1), pk, compressed); }, function () { return pk; }, function () { return pk; });
  		};
  		exports.convertPublicKeyFormat = convertPublicKeyFormat;
  		var hexToPublicKey = function (hex, curve) {
  		    var decoded = (0, hex_1.decodeHex)(hex);
  		    return _exec(curve || (0, config_1.ellipticCurve)(), function () { return compatEthPublicKey(decoded); }, function () { return decoded; }, function () { return decoded; });
  		};
  		exports.hexToPublicKey = hexToPublicKey;
  		function _exec(curve, secp256k1Callback, x25519Callback, ed25519Callback) {
  		    if (curve === "secp256k1") {
  		        return secp256k1Callback(secp256k1_1.secp256k1);
  		    }
  		    else if (curve === "x25519") {
  		        return x25519Callback(ed25519_1.x25519);
  		    }
  		    else if (curve === "ed25519") {
  		        return ed25519Callback(ed25519_1.ed25519);
  		    } /* v8 ignore next 2 */
  		    else {
  		        throw new Error("Not implemented");
  		    }
  		}
  		var compatEthPublicKey = function (pk) {
  		    if (pk.length === consts_1.ETH_PUBLIC_KEY_SIZE) {
  		        var fixed = new Uint8Array(1 + pk.length);
  		        fixed.set([0x04]);
  		        fixed.set(pk, 1);
  		        return fixed;
  		    }
  		    return pk;
  		};
  		var getSharedPointOnEd25519 = function (curve, sk, pk) {
  		    // Note: scalar is hashed from sk
  		    var scalar = curve.utils.getExtendedPublicKey(sk).scalar;
  		    var point = curve.ExtendedPoint.fromHex(pk).multiply(scalar);
  		    return point.toRawBytes(); // `compressed` in signature has no effect
  		}; 
  	} (elliptic));
  	return elliptic;
  }

  var hash = {};

  var hkdf = {};

  var hasRequiredHkdf;

  function requireHkdf () {
  	if (hasRequiredHkdf) return hkdf;
  	hasRequiredHkdf = 1;
  	Object.defineProperty(hkdf, "__esModule", { value: true });
  	hkdf.hkdf = void 0;
  	hkdf.extract = extract;
  	hkdf.expand = expand;
  	/**
  	 * HKDF (RFC 5869): extract + expand in one step.
  	 * See https://soatok.blog/2021/11/17/understanding-hkdf/.
  	 * @module
  	 */
  	const hmac_ts_1 = /*@__PURE__*/ requireHmac();
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$2();
  	/**
  	 * HKDF-extract from spec. Less important part. `HKDF-Extract(IKM, salt) -> PRK`
  	 * Arguments position differs from spec (IKM is first one, since it is not optional)
  	 * @param hash - hash function that would be used (e.g. sha256)
  	 * @param ikm - input keying material, the initial key
  	 * @param salt - optional salt value (a non-secret random value)
  	 */
  	function extract(hash, ikm, salt) {
  	    (0, utils_ts_1.ahash)(hash);
  	    // NOTE: some libraries treat zero-length array as 'not provided';
  	    // we don't, since we have undefined as 'not provided'
  	    // https://github.com/RustCrypto/KDFs/issues/15
  	    if (salt === undefined)
  	        salt = new Uint8Array(hash.outputLen);
  	    return (0, hmac_ts_1.hmac)(hash, (0, utils_ts_1.toBytes)(salt), (0, utils_ts_1.toBytes)(ikm));
  	}
  	const HKDF_COUNTER = /* @__PURE__ */ Uint8Array.from([0]);
  	const EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
  	/**
  	 * HKDF-expand from the spec. The most important part. `HKDF-Expand(PRK, info, L) -> OKM`
  	 * @param hash - hash function that would be used (e.g. sha256)
  	 * @param prk - a pseudorandom key of at least HashLen octets (usually, the output from the extract step)
  	 * @param info - optional context and application specific information (can be a zero-length string)
  	 * @param length - length of output keying material in bytes
  	 */
  	function expand(hash, prk, info, length = 32) {
  	    (0, utils_ts_1.ahash)(hash);
  	    (0, utils_ts_1.anumber)(length);
  	    const olen = hash.outputLen;
  	    if (length > 255 * olen)
  	        throw new Error('Length should be <= 255*HashLen');
  	    const blocks = Math.ceil(length / olen);
  	    if (info === undefined)
  	        info = EMPTY_BUFFER;
  	    // first L(ength) octets of T
  	    const okm = new Uint8Array(blocks * olen);
  	    // Re-use HMAC instance between blocks
  	    const HMAC = hmac_ts_1.hmac.create(hash, prk);
  	    const HMACTmp = HMAC._cloneInto();
  	    const T = new Uint8Array(HMAC.outputLen);
  	    for (let counter = 0; counter < blocks; counter++) {
  	        HKDF_COUNTER[0] = counter + 1;
  	        // T(0) = empty string (zero length)
  	        // T(N) = HMAC-Hash(PRK, T(N-1) | info | N)
  	        HMACTmp.update(counter === 0 ? EMPTY_BUFFER : T)
  	            .update(info)
  	            .update(HKDF_COUNTER)
  	            .digestInto(T);
  	        okm.set(T, olen * counter);
  	        HMAC._cloneInto(HMACTmp);
  	    }
  	    HMAC.destroy();
  	    HMACTmp.destroy();
  	    (0, utils_ts_1.clean)(T, HKDF_COUNTER);
  	    return okm.slice(0, length);
  	}
  	/**
  	 * HKDF (RFC 5869): derive keys from an initial input.
  	 * Combines hkdf_extract + hkdf_expand in one step
  	 * @param hash - hash function that would be used (e.g. sha256)
  	 * @param ikm - input keying material, the initial key
  	 * @param salt - optional salt value (a non-secret random value)
  	 * @param info - optional context and application specific information (can be a zero-length string)
  	 * @param length - length of output keying material in bytes
  	 * @example
  	 * import { hkdf } from '@noble/hashes/hkdf';
  	 * import { sha256 } from '@noble/hashes/sha2';
  	 * import { randomBytes } from '@noble/hashes/utils';
  	 * const inputKey = randomBytes(32);
  	 * const salt = randomBytes(32);
  	 * const info = 'application-key';
  	 * const hk1 = hkdf(sha256, inputKey, salt, info, 32);
  	 */
  	const hkdf$1 = (hash, ikm, salt, info, length) => expand(hash, extract(hash, ikm, salt), info, length);
  	hkdf.hkdf = hkdf$1;
  	
  	return hkdf;
  }

  var hasRequiredHash;

  function requireHash () {
  	if (hasRequiredHash) return hash;
  	hasRequiredHash = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.getSharedKey = exports.deriveKey = void 0;
  		var utils_1 = /*@__PURE__*/ requireUtils$3();
  		var hkdf_1 = /*@__PURE__*/ requireHkdf();
  		var sha2_1 = /*@__PURE__*/ requireSha2();
  		var deriveKey = function (master, salt, info) {
  		    // 32 bytes shared secret for aes256 and xchacha20 derived from HKDF-SHA256
  		    return (0, hkdf_1.hkdf)(sha2_1.sha256, master, salt, info, 32);
  		};
  		exports.deriveKey = deriveKey;
  		var getSharedKey = function () {
  		    var parts = [];
  		    for (var _i = 0; _i < arguments.length; _i++) {
  		        parts[_i] = arguments[_i];
  		    }
  		    return (0, exports.deriveKey)(utils_1.concatBytes.apply(void 0, parts));
  		};
  		exports.getSharedKey = getSharedKey; 
  	} (hash));
  	return hash;
  }

  var symmetric = {};

  var noble$1 = {};

  var aes = {};

  var _polyval = {};

  var hasRequired_polyval;

  function require_polyval () {
  	if (hasRequired_polyval) return _polyval;
  	hasRequired_polyval = 1;
  	Object.defineProperty(_polyval, "__esModule", { value: true });
  	_polyval.polyval = _polyval.ghash = void 0;
  	_polyval._toGHASHKey = _toGHASHKey;
  	/**
  	 * GHash from AES-GCM and its little-endian "mirror image" Polyval from AES-SIV.
  	 *
  	 * Implemented in terms of GHash with conversion function for keys
  	 * GCM GHASH from
  	 * [NIST SP800-38d](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf),
  	 * SIV from
  	 * [RFC 8452](https://datatracker.ietf.org/doc/html/rfc8452).
  	 *
  	 * GHASH   modulo: x^128 + x^7   + x^2   + x     + 1
  	 * POLYVAL modulo: x^128 + x^127 + x^126 + x^121 + 1
  	 *
  	 * @module
  	 */
  	// prettier-ignore
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$3();
  	const BLOCK_SIZE = 16;
  	// TODO: rewrite
  	// temporary padding buffer
  	const ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
  	const ZEROS32 = (0, utils_ts_1.u32)(ZEROS16);
  	const POLY = 0xe1; // v = 2*v % POLY
  	// v = 2*v % POLY
  	// NOTE: because x + x = 0 (add/sub is same), mul2(x) != x+x
  	// We can multiply any number using montgomery ladder and this function (works as double, add is simple xor)
  	const mul2 = (s0, s1, s2, s3) => {
  	    const hiBit = s3 & 1;
  	    return {
  	        s3: (s2 << 31) | (s3 >>> 1),
  	        s2: (s1 << 31) | (s2 >>> 1),
  	        s1: (s0 << 31) | (s1 >>> 1),
  	        s0: (s0 >>> 1) ^ ((POLY << 24) & -(hiBit & 1)), // reduce % poly
  	    };
  	};
  	const swapLE = (n) => (((n >>> 0) & 0xff) << 24) |
  	    (((n >>> 8) & 0xff) << 16) |
  	    (((n >>> 16) & 0xff) << 8) |
  	    ((n >>> 24) & 0xff) |
  	    0;
  	/**
  	 * `mulX_POLYVAL(ByteReverse(H))` from spec
  	 * @param k mutated in place
  	 */
  	function _toGHASHKey(k) {
  	    k.reverse();
  	    const hiBit = k[15] & 1;
  	    // k >>= 1
  	    let carry = 0;
  	    for (let i = 0; i < k.length; i++) {
  	        const t = k[i];
  	        k[i] = (t >>> 1) | carry;
  	        carry = (t & 1) << 7;
  	    }
  	    k[0] ^= -hiBit & 0xe1; // if (hiBit) n ^= 0xe1000000000000000000000000000000;
  	    return k;
  	}
  	const estimateWindow = (bytes) => {
  	    if (bytes > 64 * 1024)
  	        return 8;
  	    if (bytes > 1024)
  	        return 4;
  	    return 2;
  	};
  	class GHASH {
  	    // We select bits per window adaptively based on expectedLength
  	    constructor(key, expectedLength) {
  	        this.blockLen = BLOCK_SIZE;
  	        this.outputLen = BLOCK_SIZE;
  	        this.s0 = 0;
  	        this.s1 = 0;
  	        this.s2 = 0;
  	        this.s3 = 0;
  	        this.finished = false;
  	        key = (0, utils_ts_1.toBytes)(key);
  	        (0, utils_ts_1.abytes)(key, 16);
  	        const kView = (0, utils_ts_1.createView)(key);
  	        let k0 = kView.getUint32(0, false);
  	        let k1 = kView.getUint32(4, false);
  	        let k2 = kView.getUint32(8, false);
  	        let k3 = kView.getUint32(12, false);
  	        // generate table of doubled keys (half of montgomery ladder)
  	        const doubles = [];
  	        for (let i = 0; i < 128; i++) {
  	            doubles.push({ s0: swapLE(k0), s1: swapLE(k1), s2: swapLE(k2), s3: swapLE(k3) });
  	            ({ s0: k0, s1: k1, s2: k2, s3: k3 } = mul2(k0, k1, k2, k3));
  	        }
  	        const W = estimateWindow(expectedLength || 1024);
  	        if (![1, 2, 4, 8].includes(W))
  	            throw new Error('ghash: invalid window size, expected 2, 4 or 8');
  	        this.W = W;
  	        const bits = 128; // always 128 bits;
  	        const windows = bits / W;
  	        const windowSize = (this.windowSize = 2 ** W);
  	        const items = [];
  	        // Create precompute table for window of W bits
  	        for (let w = 0; w < windows; w++) {
  	            // truth table: 00, 01, 10, 11
  	            for (let byte = 0; byte < windowSize; byte++) {
  	                // prettier-ignore
  	                let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  	                for (let j = 0; j < W; j++) {
  	                    const bit = (byte >>> (W - j - 1)) & 1;
  	                    if (!bit)
  	                        continue;
  	                    const { s0: d0, s1: d1, s2: d2, s3: d3 } = doubles[W * w + j];
  	                    (s0 ^= d0), (s1 ^= d1), (s2 ^= d2), (s3 ^= d3);
  	                }
  	                items.push({ s0, s1, s2, s3 });
  	            }
  	        }
  	        this.t = items;
  	    }
  	    _updateBlock(s0, s1, s2, s3) {
  	        (s0 ^= this.s0), (s1 ^= this.s1), (s2 ^= this.s2), (s3 ^= this.s3);
  	        const { W, t, windowSize } = this;
  	        // prettier-ignore
  	        let o0 = 0, o1 = 0, o2 = 0, o3 = 0;
  	        const mask = (1 << W) - 1; // 2**W will kill performance.
  	        let w = 0;
  	        for (const num of [s0, s1, s2, s3]) {
  	            for (let bytePos = 0; bytePos < 4; bytePos++) {
  	                const byte = (num >>> (8 * bytePos)) & 0xff;
  	                for (let bitPos = 8 / W - 1; bitPos >= 0; bitPos--) {
  	                    const bit = (byte >>> (W * bitPos)) & mask;
  	                    const { s0: e0, s1: e1, s2: e2, s3: e3 } = t[w * windowSize + bit];
  	                    (o0 ^= e0), (o1 ^= e1), (o2 ^= e2), (o3 ^= e3);
  	                    w += 1;
  	                }
  	            }
  	        }
  	        this.s0 = o0;
  	        this.s1 = o1;
  	        this.s2 = o2;
  	        this.s3 = o3;
  	    }
  	    update(data) {
  	        (0, utils_ts_1.aexists)(this);
  	        data = (0, utils_ts_1.toBytes)(data);
  	        (0, utils_ts_1.abytes)(data);
  	        const b32 = (0, utils_ts_1.u32)(data);
  	        const blocks = Math.floor(data.length / BLOCK_SIZE);
  	        const left = data.length % BLOCK_SIZE;
  	        for (let i = 0; i < blocks; i++) {
  	            this._updateBlock(b32[i * 4 + 0], b32[i * 4 + 1], b32[i * 4 + 2], b32[i * 4 + 3]);
  	        }
  	        if (left) {
  	            ZEROS16.set(data.subarray(blocks * BLOCK_SIZE));
  	            this._updateBlock(ZEROS32[0], ZEROS32[1], ZEROS32[2], ZEROS32[3]);
  	            (0, utils_ts_1.clean)(ZEROS32); // clean tmp buffer
  	        }
  	        return this;
  	    }
  	    destroy() {
  	        const { t } = this;
  	        // clean precompute table
  	        for (const elm of t) {
  	            (elm.s0 = 0), (elm.s1 = 0), (elm.s2 = 0), (elm.s3 = 0);
  	        }
  	    }
  	    digestInto(out) {
  	        (0, utils_ts_1.aexists)(this);
  	        (0, utils_ts_1.aoutput)(out, this);
  	        this.finished = true;
  	        const { s0, s1, s2, s3 } = this;
  	        const o32 = (0, utils_ts_1.u32)(out);
  	        o32[0] = s0;
  	        o32[1] = s1;
  	        o32[2] = s2;
  	        o32[3] = s3;
  	        return out;
  	    }
  	    digest() {
  	        const res = new Uint8Array(BLOCK_SIZE);
  	        this.digestInto(res);
  	        this.destroy();
  	        return res;
  	    }
  	}
  	class Polyval extends GHASH {
  	    constructor(key, expectedLength) {
  	        key = (0, utils_ts_1.toBytes)(key);
  	        (0, utils_ts_1.abytes)(key);
  	        const ghKey = _toGHASHKey((0, utils_ts_1.copyBytes)(key));
  	        super(ghKey, expectedLength);
  	        (0, utils_ts_1.clean)(ghKey);
  	    }
  	    update(data) {
  	        data = (0, utils_ts_1.toBytes)(data);
  	        (0, utils_ts_1.aexists)(this);
  	        const b32 = (0, utils_ts_1.u32)(data);
  	        const left = data.length % BLOCK_SIZE;
  	        const blocks = Math.floor(data.length / BLOCK_SIZE);
  	        for (let i = 0; i < blocks; i++) {
  	            this._updateBlock(swapLE(b32[i * 4 + 3]), swapLE(b32[i * 4 + 2]), swapLE(b32[i * 4 + 1]), swapLE(b32[i * 4 + 0]));
  	        }
  	        if (left) {
  	            ZEROS16.set(data.subarray(blocks * BLOCK_SIZE));
  	            this._updateBlock(swapLE(ZEROS32[3]), swapLE(ZEROS32[2]), swapLE(ZEROS32[1]), swapLE(ZEROS32[0]));
  	            (0, utils_ts_1.clean)(ZEROS32);
  	        }
  	        return this;
  	    }
  	    digestInto(out) {
  	        (0, utils_ts_1.aexists)(this);
  	        (0, utils_ts_1.aoutput)(out, this);
  	        this.finished = true;
  	        // tmp ugly hack
  	        const { s0, s1, s2, s3 } = this;
  	        const o32 = (0, utils_ts_1.u32)(out);
  	        o32[0] = s0;
  	        o32[1] = s1;
  	        o32[2] = s2;
  	        o32[3] = s3;
  	        return out.reverse();
  	    }
  	}
  	function wrapConstructorWithKey(hashCons) {
  	    const hashC = (msg, key) => hashCons(key, msg.length).update((0, utils_ts_1.toBytes)(msg)).digest();
  	    const tmp = hashCons(new Uint8Array(16), 0);
  	    hashC.outputLen = tmp.outputLen;
  	    hashC.blockLen = tmp.blockLen;
  	    hashC.create = (key, expectedLength) => hashCons(key, expectedLength);
  	    return hashC;
  	}
  	/** GHash MAC for AES-GCM. */
  	_polyval.ghash = wrapConstructorWithKey((key, expectedLength) => new GHASH(key, expectedLength));
  	/** Polyval MAC for AES-SIV. */
  	_polyval.polyval = wrapConstructorWithKey((key, expectedLength) => new Polyval(key, expectedLength));
  	
  	return _polyval;
  }

  var hasRequiredAes;

  function requireAes () {
  	if (hasRequiredAes) return aes;
  	hasRequiredAes = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.unsafe = exports.aeskwp = exports.aeskw = exports.siv = exports.gcmsiv = exports.gcm = exports.cfb = exports.cbc = exports.ecb = exports.ctr = void 0;
  		/**
  		 * [AES](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)
  		 * a.k.a. Advanced Encryption Standard
  		 * is a variant of Rijndael block cipher, standardized by NIST in 2001.
  		 * We provide the fastest available pure JS implementation.
  		 *
  		 * Data is split into 128-bit blocks. Encrypted in 10/12/14 rounds (128/192/256 bits). In every round:
  		 * 1. **S-box**, table substitution
  		 * 2. **Shift rows**, cyclic shift left of all rows of data array
  		 * 3. **Mix columns**, multiplying every column by fixed polynomial
  		 * 4. **Add round key**, round_key xor i-th column of array
  		 *
  		 * Check out [FIPS-197](https://csrc.nist.gov/files/pubs/fips/197/final/docs/fips-197.pdf)
  		 * and [original proposal](https://csrc.nist.gov/csrc/media/projects/cryptographic-standards-and-guidelines/documents/aes-development/rijndael-ammended.pdf)
  		 * @module
  		 */
  		const _polyval_ts_1 = /*@__PURE__*/ require_polyval();
  		// prettier-ignore
  		const utils_ts_1 = /*@__PURE__*/ requireUtils$3();
  		const BLOCK_SIZE = 16;
  		const BLOCK_SIZE32 = 4;
  		const EMPTY_BLOCK = /* @__PURE__ */ new Uint8Array(BLOCK_SIZE);
  		const POLY = 0x11b; // 1 + x + x**3 + x**4 + x**8
  		// TODO: remove multiplication, binary ops only
  		function mul2(n) {
  		    return (n << 1) ^ (POLY & -(n >> 7));
  		}
  		function mul(a, b) {
  		    let res = 0;
  		    for (; b > 0; b >>= 1) {
  		        // Montgomery ladder
  		        res ^= a & -(b & 1); // if (b&1) res ^=a (but const-time).
  		        a = mul2(a); // a = 2*a
  		    }
  		    return res;
  		}
  		// AES S-box is generated using finite field inversion,
  		// an affine transform, and xor of a constant 0x63.
  		const sbox = /* @__PURE__ */ (() => {
  		    const t = new Uint8Array(256);
  		    for (let i = 0, x = 1; i < 256; i++, x ^= mul2(x))
  		        t[i] = x;
  		    const box = new Uint8Array(256);
  		    box[0] = 0x63; // first elm
  		    for (let i = 0; i < 255; i++) {
  		        let x = t[255 - i];
  		        x |= x << 8;
  		        box[t[i]] = (x ^ (x >> 4) ^ (x >> 5) ^ (x >> 6) ^ (x >> 7) ^ 0x63) & 0xff;
  		    }
  		    (0, utils_ts_1.clean)(t);
  		    return box;
  		})();
  		// Inverted S-box
  		const invSbox = /* @__PURE__ */ sbox.map((_, j) => sbox.indexOf(j));
  		// Rotate u32 by 8
  		const rotr32_8 = (n) => (n << 24) | (n >>> 8);
  		const rotl32_8 = (n) => (n << 8) | (n >>> 24);
  		// The byte swap operation for uint32 (LE<->BE)
  		const byteSwap = (word) => ((word << 24) & 0xff000000) |
  		    ((word << 8) & 0xff0000) |
  		    ((word >>> 8) & 0xff00) |
  		    ((word >>> 24) & 0xff);
  		// T-table is optimization suggested in 5.2 of original proposal (missed from FIPS-197). Changes:
  		// - LE instead of BE
  		// - bigger tables: T0 and T1 are merged into T01 table and T2 & T3 into T23;
  		//   so index is u16, instead of u8. This speeds up things, unexpectedly
  		function genTtable(sbox, fn) {
  		    if (sbox.length !== 256)
  		        throw new Error('Wrong sbox length');
  		    const T0 = new Uint32Array(256).map((_, j) => fn(sbox[j]));
  		    const T1 = T0.map(rotl32_8);
  		    const T2 = T1.map(rotl32_8);
  		    const T3 = T2.map(rotl32_8);
  		    const T01 = new Uint32Array(256 * 256);
  		    const T23 = new Uint32Array(256 * 256);
  		    const sbox2 = new Uint16Array(256 * 256);
  		    for (let i = 0; i < 256; i++) {
  		        for (let j = 0; j < 256; j++) {
  		            const idx = i * 256 + j;
  		            T01[idx] = T0[i] ^ T1[j];
  		            T23[idx] = T2[i] ^ T3[j];
  		            sbox2[idx] = (sbox[i] << 8) | sbox[j];
  		        }
  		    }
  		    return { sbox, sbox2, T0, T1, T2, T3, T01, T23 };
  		}
  		const tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => (mul(s, 3) << 24) | (s << 16) | (s << 8) | mul(s, 2));
  		const tableDecoding = /* @__PURE__ */ genTtable(invSbox, (s) => (mul(s, 11) << 24) | (mul(s, 13) << 16) | (mul(s, 9) << 8) | mul(s, 14));
  		const xPowers = /* @__PURE__ */ (() => {
  		    const p = new Uint8Array(16);
  		    for (let i = 0, x = 1; i < 16; i++, x = mul2(x))
  		        p[i] = x;
  		    return p;
  		})();
  		/** Key expansion used in CTR. */
  		function expandKeyLE(key) {
  		    (0, utils_ts_1.abytes)(key);
  		    const len = key.length;
  		    if (![16, 24, 32].includes(len))
  		        throw new Error('aes: invalid key size, should be 16, 24 or 32, got ' + len);
  		    const { sbox2 } = tableEncoding;
  		    const toClean = [];
  		    if (!(0, utils_ts_1.isAligned32)(key))
  		        toClean.push((key = (0, utils_ts_1.copyBytes)(key)));
  		    const k32 = (0, utils_ts_1.u32)(key);
  		    const Nk = k32.length;
  		    const subByte = (n) => applySbox(sbox2, n, n, n, n);
  		    const xk = new Uint32Array(len + 28); // expanded key
  		    xk.set(k32);
  		    // 4.3.1 Key expansion
  		    for (let i = Nk; i < xk.length; i++) {
  		        let t = xk[i - 1];
  		        if (i % Nk === 0)
  		            t = subByte(rotr32_8(t)) ^ xPowers[i / Nk - 1];
  		        else if (Nk > 6 && i % Nk === 4)
  		            t = subByte(t);
  		        xk[i] = xk[i - Nk] ^ t;
  		    }
  		    (0, utils_ts_1.clean)(...toClean);
  		    return xk;
  		}
  		function expandKeyDecLE(key) {
  		    const encKey = expandKeyLE(key);
  		    const xk = encKey.slice();
  		    const Nk = encKey.length;
  		    const { sbox2 } = tableEncoding;
  		    const { T0, T1, T2, T3 } = tableDecoding;
  		    // Inverse key by chunks of 4 (rounds)
  		    for (let i = 0; i < Nk; i += 4) {
  		        for (let j = 0; j < 4; j++)
  		            xk[i + j] = encKey[Nk - i - 4 + j];
  		    }
  		    (0, utils_ts_1.clean)(encKey);
  		    // apply InvMixColumn except first & last round
  		    for (let i = 4; i < Nk - 4; i++) {
  		        const x = xk[i];
  		        const w = applySbox(sbox2, x, x, x, x);
  		        xk[i] = T0[w & 0xff] ^ T1[(w >>> 8) & 0xff] ^ T2[(w >>> 16) & 0xff] ^ T3[w >>> 24];
  		    }
  		    return xk;
  		}
  		// Apply tables
  		function apply0123(T01, T23, s0, s1, s2, s3) {
  		    return (T01[((s0 << 8) & 0xff00) | ((s1 >>> 8) & 0xff)] ^
  		        T23[((s2 >>> 8) & 0xff00) | ((s3 >>> 24) & 0xff)]);
  		}
  		function applySbox(sbox2, s0, s1, s2, s3) {
  		    return (sbox2[(s0 & 0xff) | (s1 & 0xff00)] |
  		        (sbox2[((s2 >>> 16) & 0xff) | ((s3 >>> 16) & 0xff00)] << 16));
  		}
  		function encrypt(xk, s0, s1, s2, s3) {
  		    const { sbox2, T01, T23 } = tableEncoding;
  		    let k = 0;
  		    (s0 ^= xk[k++]), (s1 ^= xk[k++]), (s2 ^= xk[k++]), (s3 ^= xk[k++]);
  		    const rounds = xk.length / 4 - 2;
  		    for (let i = 0; i < rounds; i++) {
  		        const t0 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
  		        const t1 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
  		        const t2 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
  		        const t3 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
  		        (s0 = t0), (s1 = t1), (s2 = t2), (s3 = t3);
  		    }
  		    // last round (without mixcolumns, so using SBOX2 table)
  		    const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
  		    const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
  		    const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
  		    const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
  		    return { s0: t0, s1: t1, s2: t2, s3: t3 };
  		}
  		// Can't be merged with encrypt: arg positions for apply0123 / applySbox are different
  		function decrypt(xk, s0, s1, s2, s3) {
  		    const { sbox2, T01, T23 } = tableDecoding;
  		    let k = 0;
  		    (s0 ^= xk[k++]), (s1 ^= xk[k++]), (s2 ^= xk[k++]), (s3 ^= xk[k++]);
  		    const rounds = xk.length / 4 - 2;
  		    for (let i = 0; i < rounds; i++) {
  		        const t0 = xk[k++] ^ apply0123(T01, T23, s0, s3, s2, s1);
  		        const t1 = xk[k++] ^ apply0123(T01, T23, s1, s0, s3, s2);
  		        const t2 = xk[k++] ^ apply0123(T01, T23, s2, s1, s0, s3);
  		        const t3 = xk[k++] ^ apply0123(T01, T23, s3, s2, s1, s0);
  		        (s0 = t0), (s1 = t1), (s2 = t2), (s3 = t3);
  		    }
  		    // Last round
  		    const t0 = xk[k++] ^ applySbox(sbox2, s0, s3, s2, s1);
  		    const t1 = xk[k++] ^ applySbox(sbox2, s1, s0, s3, s2);
  		    const t2 = xk[k++] ^ applySbox(sbox2, s2, s1, s0, s3);
  		    const t3 = xk[k++] ^ applySbox(sbox2, s3, s2, s1, s0);
  		    return { s0: t0, s1: t1, s2: t2, s3: t3 };
  		}
  		// TODO: investigate merging with ctr32
  		function ctrCounter(xk, nonce, src, dst) {
  		    (0, utils_ts_1.abytes)(nonce, BLOCK_SIZE);
  		    (0, utils_ts_1.abytes)(src);
  		    const srcLen = src.length;
  		    dst = (0, utils_ts_1.getOutput)(srcLen, dst);
  		    (0, utils_ts_1.complexOverlapBytes)(src, dst);
  		    const ctr = nonce;
  		    const c32 = (0, utils_ts_1.u32)(ctr);
  		    // Fill block (empty, ctr=0)
  		    let { s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]);
  		    const src32 = (0, utils_ts_1.u32)(src);
  		    const dst32 = (0, utils_ts_1.u32)(dst);
  		    // process blocks
  		    for (let i = 0; i + 4 <= src32.length; i += 4) {
  		        dst32[i + 0] = src32[i + 0] ^ s0;
  		        dst32[i + 1] = src32[i + 1] ^ s1;
  		        dst32[i + 2] = src32[i + 2] ^ s2;
  		        dst32[i + 3] = src32[i + 3] ^ s3;
  		        // Full 128 bit counter with wrap around
  		        let carry = 1;
  		        for (let i = ctr.length - 1; i >= 0; i--) {
  		            carry = (carry + (ctr[i] & 0xff)) | 0;
  		            ctr[i] = carry & 0xff;
  		            carry >>>= 8;
  		        }
  		        ({ s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]));
  		    }
  		    // leftovers (less than block)
  		    // It's possible to handle > u32 fast, but is it worth it?
  		    const start = BLOCK_SIZE * Math.floor(src32.length / BLOCK_SIZE32);
  		    if (start < srcLen) {
  		        const b32 = new Uint32Array([s0, s1, s2, s3]);
  		        const buf = (0, utils_ts_1.u8)(b32);
  		        for (let i = start, pos = 0; i < srcLen; i++, pos++)
  		            dst[i] = src[i] ^ buf[pos];
  		        (0, utils_ts_1.clean)(b32);
  		    }
  		    return dst;
  		}
  		// AES CTR with overflowing 32 bit counter
  		// It's possible to do 32le significantly simpler (and probably faster) by using u32.
  		// But, we need both, and perf bottleneck is in ghash anyway.
  		function ctr32(xk, isLE, nonce, src, dst) {
  		    (0, utils_ts_1.abytes)(nonce, BLOCK_SIZE);
  		    (0, utils_ts_1.abytes)(src);
  		    dst = (0, utils_ts_1.getOutput)(src.length, dst);
  		    const ctr = nonce; // write new value to nonce, so it can be re-used
  		    const c32 = (0, utils_ts_1.u32)(ctr);
  		    const view = (0, utils_ts_1.createView)(ctr);
  		    const src32 = (0, utils_ts_1.u32)(src);
  		    const dst32 = (0, utils_ts_1.u32)(dst);
  		    const ctrPos = isLE ? 0 : 12;
  		    const srcLen = src.length;
  		    // Fill block (empty, ctr=0)
  		    let ctrNum = view.getUint32(ctrPos, isLE); // read current counter value
  		    let { s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]);
  		    // process blocks
  		    for (let i = 0; i + 4 <= src32.length; i += 4) {
  		        dst32[i + 0] = src32[i + 0] ^ s0;
  		        dst32[i + 1] = src32[i + 1] ^ s1;
  		        dst32[i + 2] = src32[i + 2] ^ s2;
  		        dst32[i + 3] = src32[i + 3] ^ s3;
  		        ctrNum = (ctrNum + 1) >>> 0; // u32 wrap
  		        view.setUint32(ctrPos, ctrNum, isLE);
  		        ({ s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]));
  		    }
  		    // leftovers (less than a block)
  		    const start = BLOCK_SIZE * Math.floor(src32.length / BLOCK_SIZE32);
  		    if (start < srcLen) {
  		        const b32 = new Uint32Array([s0, s1, s2, s3]);
  		        const buf = (0, utils_ts_1.u8)(b32);
  		        for (let i = start, pos = 0; i < srcLen; i++, pos++)
  		            dst[i] = src[i] ^ buf[pos];
  		        (0, utils_ts_1.clean)(b32);
  		    }
  		    return dst;
  		}
  		/**
  		 * CTR: counter mode. Creates stream cipher.
  		 * Requires good IV. Parallelizable. OK, but no MAC.
  		 */
  		exports.ctr = (0, utils_ts_1.wrapCipher)({ blockSize: 16, nonceLength: 16 }, function aesctr(key, nonce) {
  		    function processCtr(buf, dst) {
  		        (0, utils_ts_1.abytes)(buf);
  		        if (dst !== undefined) {
  		            (0, utils_ts_1.abytes)(dst);
  		            if (!(0, utils_ts_1.isAligned32)(dst))
  		                throw new Error('unaligned destination');
  		        }
  		        const xk = expandKeyLE(key);
  		        const n = (0, utils_ts_1.copyBytes)(nonce); // align + avoid changing
  		        const toClean = [xk, n];
  		        if (!(0, utils_ts_1.isAligned32)(buf))
  		            toClean.push((buf = (0, utils_ts_1.copyBytes)(buf)));
  		        const out = ctrCounter(xk, n, buf, dst);
  		        (0, utils_ts_1.clean)(...toClean);
  		        return out;
  		    }
  		    return {
  		        encrypt: (plaintext, dst) => processCtr(plaintext, dst),
  		        decrypt: (ciphertext, dst) => processCtr(ciphertext, dst),
  		    };
  		});
  		function validateBlockDecrypt(data) {
  		    (0, utils_ts_1.abytes)(data);
  		    if (data.length % BLOCK_SIZE !== 0) {
  		        throw new Error('aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size ' + BLOCK_SIZE);
  		    }
  		}
  		function validateBlockEncrypt(plaintext, pcks5, dst) {
  		    (0, utils_ts_1.abytes)(plaintext);
  		    let outLen = plaintext.length;
  		    const remaining = outLen % BLOCK_SIZE;
  		    if (!pcks5 && remaining !== 0)
  		        throw new Error('aec/(cbc-ecb): unpadded plaintext with disabled padding');
  		    if (!(0, utils_ts_1.isAligned32)(plaintext))
  		        plaintext = (0, utils_ts_1.copyBytes)(plaintext);
  		    const b = (0, utils_ts_1.u32)(plaintext);
  		    if (pcks5) {
  		        let left = BLOCK_SIZE - remaining;
  		        if (!left)
  		            left = BLOCK_SIZE; // if no bytes left, create empty padding block
  		        outLen = outLen + left;
  		    }
  		    dst = (0, utils_ts_1.getOutput)(outLen, dst);
  		    (0, utils_ts_1.complexOverlapBytes)(plaintext, dst);
  		    const o = (0, utils_ts_1.u32)(dst);
  		    return { b, o, out: dst };
  		}
  		function validatePCKS(data, pcks5) {
  		    if (!pcks5)
  		        return data;
  		    const len = data.length;
  		    if (!len)
  		        throw new Error('aes/pcks5: empty ciphertext not allowed');
  		    const lastByte = data[len - 1];
  		    if (lastByte <= 0 || lastByte > 16)
  		        throw new Error('aes/pcks5: wrong padding');
  		    const out = data.subarray(0, -lastByte);
  		    for (let i = 0; i < lastByte; i++)
  		        if (data[len - i - 1] !== lastByte)
  		            throw new Error('aes/pcks5: wrong padding');
  		    return out;
  		}
  		function padPCKS(left) {
  		    const tmp = new Uint8Array(16);
  		    const tmp32 = (0, utils_ts_1.u32)(tmp);
  		    tmp.set(left);
  		    const paddingByte = BLOCK_SIZE - left.length;
  		    for (let i = BLOCK_SIZE - paddingByte; i < BLOCK_SIZE; i++)
  		        tmp[i] = paddingByte;
  		    return tmp32;
  		}
  		/**
  		 * ECB: Electronic CodeBook. Simple deterministic replacement.
  		 * Dangerous: always map x to y. See [AES Penguin](https://words.filippo.io/the-ecb-penguin/).
  		 */
  		exports.ecb = (0, utils_ts_1.wrapCipher)({ blockSize: 16 }, function aesecb(key, opts = {}) {
  		    const pcks5 = !opts.disablePadding;
  		    return {
  		        encrypt(plaintext, dst) {
  		            const { b, o, out: _out } = validateBlockEncrypt(plaintext, pcks5, dst);
  		            const xk = expandKeyLE(key);
  		            let i = 0;
  		            for (; i + 4 <= b.length;) {
  		                const { s0, s1, s2, s3 } = encrypt(xk, b[i + 0], b[i + 1], b[i + 2], b[i + 3]);
  		                (o[i++] = s0), (o[i++] = s1), (o[i++] = s2), (o[i++] = s3);
  		            }
  		            if (pcks5) {
  		                const tmp32 = padPCKS(plaintext.subarray(i * 4));
  		                const { s0, s1, s2, s3 } = encrypt(xk, tmp32[0], tmp32[1], tmp32[2], tmp32[3]);
  		                (o[i++] = s0), (o[i++] = s1), (o[i++] = s2), (o[i++] = s3);
  		            }
  		            (0, utils_ts_1.clean)(xk);
  		            return _out;
  		        },
  		        decrypt(ciphertext, dst) {
  		            validateBlockDecrypt(ciphertext);
  		            const xk = expandKeyDecLE(key);
  		            dst = (0, utils_ts_1.getOutput)(ciphertext.length, dst);
  		            const toClean = [xk];
  		            if (!(0, utils_ts_1.isAligned32)(ciphertext))
  		                toClean.push((ciphertext = (0, utils_ts_1.copyBytes)(ciphertext)));
  		            (0, utils_ts_1.complexOverlapBytes)(ciphertext, dst);
  		            const b = (0, utils_ts_1.u32)(ciphertext);
  		            const o = (0, utils_ts_1.u32)(dst);
  		            for (let i = 0; i + 4 <= b.length;) {
  		                const { s0, s1, s2, s3 } = decrypt(xk, b[i + 0], b[i + 1], b[i + 2], b[i + 3]);
  		                (o[i++] = s0), (o[i++] = s1), (o[i++] = s2), (o[i++] = s3);
  		            }
  		            (0, utils_ts_1.clean)(...toClean);
  		            return validatePCKS(dst, pcks5);
  		        },
  		    };
  		});
  		/**
  		 * CBC: Cipher-Block-Chaining. Key is previous round’s block.
  		 * Fragile: needs proper padding. Unauthenticated: needs MAC.
  		 */
  		exports.cbc = (0, utils_ts_1.wrapCipher)({ blockSize: 16, nonceLength: 16 }, function aescbc(key, iv, opts = {}) {
  		    const pcks5 = !opts.disablePadding;
  		    return {
  		        encrypt(plaintext, dst) {
  		            const xk = expandKeyLE(key);
  		            const { b, o, out: _out } = validateBlockEncrypt(plaintext, pcks5, dst);
  		            let _iv = iv;
  		            const toClean = [xk];
  		            if (!(0, utils_ts_1.isAligned32)(_iv))
  		                toClean.push((_iv = (0, utils_ts_1.copyBytes)(_iv)));
  		            const n32 = (0, utils_ts_1.u32)(_iv);
  		            // prettier-ignore
  		            let s0 = n32[0], s1 = n32[1], s2 = n32[2], s3 = n32[3];
  		            let i = 0;
  		            for (; i + 4 <= b.length;) {
  		                (s0 ^= b[i + 0]), (s1 ^= b[i + 1]), (s2 ^= b[i + 2]), (s3 ^= b[i + 3]);
  		                ({ s0, s1, s2, s3 } = encrypt(xk, s0, s1, s2, s3));
  		                (o[i++] = s0), (o[i++] = s1), (o[i++] = s2), (o[i++] = s3);
  		            }
  		            if (pcks5) {
  		                const tmp32 = padPCKS(plaintext.subarray(i * 4));
  		                (s0 ^= tmp32[0]), (s1 ^= tmp32[1]), (s2 ^= tmp32[2]), (s3 ^= tmp32[3]);
  		                ({ s0, s1, s2, s3 } = encrypt(xk, s0, s1, s2, s3));
  		                (o[i++] = s0), (o[i++] = s1), (o[i++] = s2), (o[i++] = s3);
  		            }
  		            (0, utils_ts_1.clean)(...toClean);
  		            return _out;
  		        },
  		        decrypt(ciphertext, dst) {
  		            validateBlockDecrypt(ciphertext);
  		            const xk = expandKeyDecLE(key);
  		            let _iv = iv;
  		            const toClean = [xk];
  		            if (!(0, utils_ts_1.isAligned32)(_iv))
  		                toClean.push((_iv = (0, utils_ts_1.copyBytes)(_iv)));
  		            const n32 = (0, utils_ts_1.u32)(_iv);
  		            dst = (0, utils_ts_1.getOutput)(ciphertext.length, dst);
  		            if (!(0, utils_ts_1.isAligned32)(ciphertext))
  		                toClean.push((ciphertext = (0, utils_ts_1.copyBytes)(ciphertext)));
  		            (0, utils_ts_1.complexOverlapBytes)(ciphertext, dst);
  		            const b = (0, utils_ts_1.u32)(ciphertext);
  		            const o = (0, utils_ts_1.u32)(dst);
  		            // prettier-ignore
  		            let s0 = n32[0], s1 = n32[1], s2 = n32[2], s3 = n32[3];
  		            for (let i = 0; i + 4 <= b.length;) {
  		                // prettier-ignore
  		                const ps0 = s0, ps1 = s1, ps2 = s2, ps3 = s3;
  		                (s0 = b[i + 0]), (s1 = b[i + 1]), (s2 = b[i + 2]), (s3 = b[i + 3]);
  		                const { s0: o0, s1: o1, s2: o2, s3: o3 } = decrypt(xk, s0, s1, s2, s3);
  		                (o[i++] = o0 ^ ps0), (o[i++] = o1 ^ ps1), (o[i++] = o2 ^ ps2), (o[i++] = o3 ^ ps3);
  		            }
  		            (0, utils_ts_1.clean)(...toClean);
  		            return validatePCKS(dst, pcks5);
  		        },
  		    };
  		});
  		/**
  		 * CFB: Cipher Feedback Mode. The input for the block cipher is the previous cipher output.
  		 * Unauthenticated: needs MAC.
  		 */
  		exports.cfb = (0, utils_ts_1.wrapCipher)({ blockSize: 16, nonceLength: 16 }, function aescfb(key, iv) {
  		    function processCfb(src, isEncrypt, dst) {
  		        (0, utils_ts_1.abytes)(src);
  		        const srcLen = src.length;
  		        dst = (0, utils_ts_1.getOutput)(srcLen, dst);
  		        if ((0, utils_ts_1.overlapBytes)(src, dst))
  		            throw new Error('overlapping src and dst not supported.');
  		        const xk = expandKeyLE(key);
  		        let _iv = iv;
  		        const toClean = [xk];
  		        if (!(0, utils_ts_1.isAligned32)(_iv))
  		            toClean.push((_iv = (0, utils_ts_1.copyBytes)(_iv)));
  		        if (!(0, utils_ts_1.isAligned32)(src))
  		            toClean.push((src = (0, utils_ts_1.copyBytes)(src)));
  		        const src32 = (0, utils_ts_1.u32)(src);
  		        const dst32 = (0, utils_ts_1.u32)(dst);
  		        const next32 = isEncrypt ? dst32 : src32;
  		        const n32 = (0, utils_ts_1.u32)(_iv);
  		        // prettier-ignore
  		        let s0 = n32[0], s1 = n32[1], s2 = n32[2], s3 = n32[3];
  		        for (let i = 0; i + 4 <= src32.length;) {
  		            const { s0: e0, s1: e1, s2: e2, s3: e3 } = encrypt(xk, s0, s1, s2, s3);
  		            dst32[i + 0] = src32[i + 0] ^ e0;
  		            dst32[i + 1] = src32[i + 1] ^ e1;
  		            dst32[i + 2] = src32[i + 2] ^ e2;
  		            dst32[i + 3] = src32[i + 3] ^ e3;
  		            (s0 = next32[i++]), (s1 = next32[i++]), (s2 = next32[i++]), (s3 = next32[i++]);
  		        }
  		        // leftovers (less than block)
  		        const start = BLOCK_SIZE * Math.floor(src32.length / BLOCK_SIZE32);
  		        if (start < srcLen) {
  		            ({ s0, s1, s2, s3 } = encrypt(xk, s0, s1, s2, s3));
  		            const buf = (0, utils_ts_1.u8)(new Uint32Array([s0, s1, s2, s3]));
  		            for (let i = start, pos = 0; i < srcLen; i++, pos++)
  		                dst[i] = src[i] ^ buf[pos];
  		            (0, utils_ts_1.clean)(buf);
  		        }
  		        (0, utils_ts_1.clean)(...toClean);
  		        return dst;
  		    }
  		    return {
  		        encrypt: (plaintext, dst) => processCfb(plaintext, true, dst),
  		        decrypt: (ciphertext, dst) => processCfb(ciphertext, false, dst),
  		    };
  		});
  		// TODO: merge with chacha, however gcm has bitLen while chacha has byteLen
  		function computeTag(fn, isLE, key, data, AAD) {
  		    const aadLength = AAD ? AAD.length : 0;
  		    const h = fn.create(key, data.length + aadLength);
  		    if (AAD)
  		        h.update(AAD);
  		    const num = (0, utils_ts_1.u64Lengths)(8 * data.length, 8 * aadLength, isLE);
  		    h.update(data);
  		    h.update(num);
  		    const res = h.digest();
  		    (0, utils_ts_1.clean)(num);
  		    return res;
  		}
  		/**
  		 * GCM: Galois/Counter Mode.
  		 * Modern, parallel version of CTR, with MAC.
  		 * Be careful: MACs can be forged.
  		 * Unsafe to use random nonces under the same key, due to collision chance.
  		 * As for nonce size, prefer 12-byte, instead of 8-byte.
  		 */
  		exports.gcm = (0, utils_ts_1.wrapCipher)({ blockSize: 16, nonceLength: 12, tagLength: 16, varSizeNonce: true }, function aesgcm(key, nonce, AAD) {
  		    // NIST 800-38d doesn't enforce minimum nonce length.
  		    // We enforce 8 bytes for compat with openssl.
  		    // 12 bytes are recommended. More than 12 bytes would be converted into 12.
  		    if (nonce.length < 8)
  		        throw new Error('aes/gcm: invalid nonce length');
  		    const tagLength = 16;
  		    function _computeTag(authKey, tagMask, data) {
  		        const tag = computeTag(_polyval_ts_1.ghash, false, authKey, data, AAD);
  		        for (let i = 0; i < tagMask.length; i++)
  		            tag[i] ^= tagMask[i];
  		        return tag;
  		    }
  		    function deriveKeys() {
  		        const xk = expandKeyLE(key);
  		        const authKey = EMPTY_BLOCK.slice();
  		        const counter = EMPTY_BLOCK.slice();
  		        ctr32(xk, false, counter, counter, authKey);
  		        // NIST 800-38d, page 15: different behavior for 96-bit and non-96-bit nonces
  		        if (nonce.length === 12) {
  		            counter.set(nonce);
  		        }
  		        else {
  		            const nonceLen = EMPTY_BLOCK.slice();
  		            const view = (0, utils_ts_1.createView)(nonceLen);
  		            (0, utils_ts_1.setBigUint64)(view, 8, BigInt(nonce.length * 8), false);
  		            // ghash(nonce || u64be(0) || u64be(nonceLen*8))
  		            const g = _polyval_ts_1.ghash.create(authKey).update(nonce).update(nonceLen);
  		            g.digestInto(counter); // digestInto doesn't trigger '.destroy'
  		            g.destroy();
  		        }
  		        const tagMask = ctr32(xk, false, counter, EMPTY_BLOCK);
  		        return { xk, authKey, counter, tagMask };
  		    }
  		    return {
  		        encrypt(plaintext) {
  		            const { xk, authKey, counter, tagMask } = deriveKeys();
  		            const out = new Uint8Array(plaintext.length + tagLength);
  		            const toClean = [xk, authKey, counter, tagMask];
  		            if (!(0, utils_ts_1.isAligned32)(plaintext))
  		                toClean.push((plaintext = (0, utils_ts_1.copyBytes)(plaintext)));
  		            ctr32(xk, false, counter, plaintext, out.subarray(0, plaintext.length));
  		            const tag = _computeTag(authKey, tagMask, out.subarray(0, out.length - tagLength));
  		            toClean.push(tag);
  		            out.set(tag, plaintext.length);
  		            (0, utils_ts_1.clean)(...toClean);
  		            return out;
  		        },
  		        decrypt(ciphertext) {
  		            const { xk, authKey, counter, tagMask } = deriveKeys();
  		            const toClean = [xk, authKey, tagMask, counter];
  		            if (!(0, utils_ts_1.isAligned32)(ciphertext))
  		                toClean.push((ciphertext = (0, utils_ts_1.copyBytes)(ciphertext)));
  		            const data = ciphertext.subarray(0, -tagLength);
  		            const passedTag = ciphertext.subarray(-tagLength);
  		            const tag = _computeTag(authKey, tagMask, data);
  		            toClean.push(tag);
  		            if (!(0, utils_ts_1.equalBytes)(tag, passedTag))
  		                throw new Error('aes/gcm: invalid ghash tag');
  		            const out = ctr32(xk, false, counter, data);
  		            (0, utils_ts_1.clean)(...toClean);
  		            return out;
  		        },
  		    };
  		});
  		const limit = (name, min, max) => (value) => {
  		    if (!Number.isSafeInteger(value) || min > value || value > max) {
  		        const minmax = '[' + min + '..' + max + ']';
  		        throw new Error('' + name + ': expected value in range ' + minmax + ', got ' + value);
  		    }
  		};
  		/**
  		 * AES-GCM-SIV: classic AES-GCM with nonce-misuse resistance.
  		 * Guarantees that, when a nonce is repeated, the only security loss is that identical
  		 * plaintexts will produce identical ciphertexts.
  		 * RFC 8452, https://datatracker.ietf.org/doc/html/rfc8452
  		 */
  		exports.gcmsiv = (0, utils_ts_1.wrapCipher)({ blockSize: 16, nonceLength: 12, tagLength: 16, varSizeNonce: true }, function aessiv(key, nonce, AAD) {
  		    const tagLength = 16;
  		    // From RFC 8452: Section 6
  		    const AAD_LIMIT = limit('AAD', 0, 2 ** 36);
  		    const PLAIN_LIMIT = limit('plaintext', 0, 2 ** 36);
  		    const NONCE_LIMIT = limit('nonce', 12, 12);
  		    const CIPHER_LIMIT = limit('ciphertext', 16, 2 ** 36 + 16);
  		    (0, utils_ts_1.abytes)(key, 16, 24, 32);
  		    NONCE_LIMIT(nonce.length);
  		    if (AAD !== undefined)
  		        AAD_LIMIT(AAD.length);
  		    function deriveKeys() {
  		        const xk = expandKeyLE(key);
  		        const encKey = new Uint8Array(key.length);
  		        const authKey = new Uint8Array(16);
  		        const toClean = [xk, encKey];
  		        let _nonce = nonce;
  		        if (!(0, utils_ts_1.isAligned32)(_nonce))
  		            toClean.push((_nonce = (0, utils_ts_1.copyBytes)(_nonce)));
  		        const n32 = (0, utils_ts_1.u32)(_nonce);
  		        // prettier-ignore
  		        let s0 = 0, s1 = n32[0], s2 = n32[1], s3 = n32[2];
  		        let counter = 0;
  		        for (const derivedKey of [authKey, encKey].map(utils_ts_1.u32)) {
  		            const d32 = (0, utils_ts_1.u32)(derivedKey);
  		            for (let i = 0; i < d32.length; i += 2) {
  		                // aes(u32le(0) || nonce)[:8] || aes(u32le(1) || nonce)[:8] ...
  		                const { s0: o0, s1: o1 } = encrypt(xk, s0, s1, s2, s3);
  		                d32[i + 0] = o0;
  		                d32[i + 1] = o1;
  		                s0 = ++counter; // increment counter inside state
  		            }
  		        }
  		        const res = { authKey, encKey: expandKeyLE(encKey) };
  		        // Cleanup
  		        (0, utils_ts_1.clean)(...toClean);
  		        return res;
  		    }
  		    function _computeTag(encKey, authKey, data) {
  		        const tag = computeTag(_polyval_ts_1.polyval, true, authKey, data, AAD);
  		        // Compute the expected tag by XORing S_s and the nonce, clearing the
  		        // most significant bit of the last byte and encrypting with the
  		        // message-encryption key.
  		        for (let i = 0; i < 12; i++)
  		            tag[i] ^= nonce[i];
  		        tag[15] &= 0x7f; // Clear the highest bit
  		        // encrypt tag as block
  		        const t32 = (0, utils_ts_1.u32)(tag);
  		        // prettier-ignore
  		        let s0 = t32[0], s1 = t32[1], s2 = t32[2], s3 = t32[3];
  		        ({ s0, s1, s2, s3 } = encrypt(encKey, s0, s1, s2, s3));
  		        (t32[0] = s0), (t32[1] = s1), (t32[2] = s2), (t32[3] = s3);
  		        return tag;
  		    }
  		    // actual decrypt/encrypt of message.
  		    function processSiv(encKey, tag, input) {
  		        let block = (0, utils_ts_1.copyBytes)(tag);
  		        block[15] |= 0x80; // Force highest bit
  		        const res = ctr32(encKey, true, block, input);
  		        // Cleanup
  		        (0, utils_ts_1.clean)(block);
  		        return res;
  		    }
  		    return {
  		        encrypt(plaintext) {
  		            PLAIN_LIMIT(plaintext.length);
  		            const { encKey, authKey } = deriveKeys();
  		            const tag = _computeTag(encKey, authKey, plaintext);
  		            const toClean = [encKey, authKey, tag];
  		            if (!(0, utils_ts_1.isAligned32)(plaintext))
  		                toClean.push((plaintext = (0, utils_ts_1.copyBytes)(plaintext)));
  		            const out = new Uint8Array(plaintext.length + tagLength);
  		            out.set(tag, plaintext.length);
  		            out.set(processSiv(encKey, tag, plaintext));
  		            // Cleanup
  		            (0, utils_ts_1.clean)(...toClean);
  		            return out;
  		        },
  		        decrypt(ciphertext) {
  		            CIPHER_LIMIT(ciphertext.length);
  		            const tag = ciphertext.subarray(-tagLength);
  		            const { encKey, authKey } = deriveKeys();
  		            const toClean = [encKey, authKey];
  		            if (!(0, utils_ts_1.isAligned32)(ciphertext))
  		                toClean.push((ciphertext = (0, utils_ts_1.copyBytes)(ciphertext)));
  		            const plaintext = processSiv(encKey, tag, ciphertext.subarray(0, -tagLength));
  		            const expectedTag = _computeTag(encKey, authKey, plaintext);
  		            toClean.push(expectedTag);
  		            if (!(0, utils_ts_1.equalBytes)(tag, expectedTag)) {
  		                (0, utils_ts_1.clean)(...toClean);
  		                throw new Error('invalid polyval tag');
  		            }
  		            // Cleanup
  		            (0, utils_ts_1.clean)(...toClean);
  		            return plaintext;
  		        },
  		    };
  		});
  		/**
  		 * AES-GCM-SIV, not AES-SIV.
  		 * This is legace name, use `gcmsiv` export instead.
  		 * @deprecated
  		 */
  		exports.siv = exports.gcmsiv;
  		function isBytes32(a) {
  		    return (a instanceof Uint32Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint32Array'));
  		}
  		function encryptBlock(xk, block) {
  		    (0, utils_ts_1.abytes)(block, 16);
  		    if (!isBytes32(xk))
  		        throw new Error('_encryptBlock accepts result of expandKeyLE');
  		    const b32 = (0, utils_ts_1.u32)(block);
  		    let { s0, s1, s2, s3 } = encrypt(xk, b32[0], b32[1], b32[2], b32[3]);
  		    (b32[0] = s0), (b32[1] = s1), (b32[2] = s2), (b32[3] = s3);
  		    return block;
  		}
  		function decryptBlock(xk, block) {
  		    (0, utils_ts_1.abytes)(block, 16);
  		    if (!isBytes32(xk))
  		        throw new Error('_decryptBlock accepts result of expandKeyLE');
  		    const b32 = (0, utils_ts_1.u32)(block);
  		    let { s0, s1, s2, s3 } = decrypt(xk, b32[0], b32[1], b32[2], b32[3]);
  		    (b32[0] = s0), (b32[1] = s1), (b32[2] = s2), (b32[3] = s3);
  		    return block;
  		}
  		/**
  		 * AES-W (base for AESKW/AESKWP).
  		 * Specs: [SP800-38F](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-38F.pdf),
  		 * [RFC 3394](https://datatracker.ietf.org/doc/rfc3394/),
  		 * [RFC 5649](https://datatracker.ietf.org/doc/rfc5649/).
  		 */
  		const AESW = {
  		    /*
  		    High-level pseudocode:
  		    ```
  		    A: u64 = IV
  		    out = []
  		    for (let i=0, ctr = 0; i<6; i++) {
  		      for (const chunk of chunks(plaintext, 8)) {
  		        A ^= swapEndianess(ctr++)
  		        [A, res] = chunks(encrypt(A || chunk), 8);
  		        out ||= res
  		      }
  		    }
  		    out = A || out
  		    ```
  		    Decrypt is the same, but reversed.
  		    */
  		    encrypt(kek, out) {
  		        // Size is limited to 4GB, otherwise ctr will overflow and we'll need to switch to bigints.
  		        // If you need it larger, open an issue.
  		        if (out.length >= 2 ** 32)
  		            throw new Error('plaintext should be less than 4gb');
  		        const xk = expandKeyLE(kek);
  		        if (out.length === 16)
  		            encryptBlock(xk, out);
  		        else {
  		            const o32 = (0, utils_ts_1.u32)(out);
  		            // prettier-ignore
  		            let a0 = o32[0], a1 = o32[1]; // A
  		            for (let j = 0, ctr = 1; j < 6; j++) {
  		                for (let pos = 2; pos < o32.length; pos += 2, ctr++) {
  		                    const { s0, s1, s2, s3 } = encrypt(xk, a0, a1, o32[pos], o32[pos + 1]);
  		                    // A = MSB(64, B) ^ t where t = (n*j)+i
  		                    (a0 = s0), (a1 = s1 ^ byteSwap(ctr)), (o32[pos] = s2), (o32[pos + 1] = s3);
  		                }
  		            }
  		            (o32[0] = a0), (o32[1] = a1); // out = A || out
  		        }
  		        xk.fill(0);
  		    },
  		    decrypt(kek, out) {
  		        if (out.length - 8 >= 2 ** 32)
  		            throw new Error('ciphertext should be less than 4gb');
  		        const xk = expandKeyDecLE(kek);
  		        const chunks = out.length / 8 - 1; // first chunk is IV
  		        if (chunks === 1)
  		            decryptBlock(xk, out);
  		        else {
  		            const o32 = (0, utils_ts_1.u32)(out);
  		            // prettier-ignore
  		            let a0 = o32[0], a1 = o32[1]; // A
  		            for (let j = 0, ctr = chunks * 6; j < 6; j++) {
  		                for (let pos = chunks * 2; pos >= 1; pos -= 2, ctr--) {
  		                    a1 ^= byteSwap(ctr);
  		                    const { s0, s1, s2, s3 } = decrypt(xk, a0, a1, o32[pos], o32[pos + 1]);
  		                    (a0 = s0), (a1 = s1), (o32[pos] = s2), (o32[pos + 1] = s3);
  		                }
  		            }
  		            (o32[0] = a0), (o32[1] = a1);
  		        }
  		        xk.fill(0);
  		    },
  		};
  		const AESKW_IV = /* @__PURE__ */ new Uint8Array(8).fill(0xa6); // A6A6A6A6A6A6A6A6
  		/**
  		 * AES-KW (key-wrap). Injects static IV into plaintext, adds counter, encrypts 6 times.
  		 * Reduces block size from 16 to 8 bytes.
  		 * For padded version, use aeskwp.
  		 * [RFC 3394](https://datatracker.ietf.org/doc/rfc3394/),
  		 * [NIST.SP.800-38F](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-38F.pdf).
  		 */
  		exports.aeskw = (0, utils_ts_1.wrapCipher)({ blockSize: 8 }, (kek) => ({
  		    encrypt(plaintext) {
  		        if (!plaintext.length || plaintext.length % 8 !== 0)
  		            throw new Error('invalid plaintext length');
  		        if (plaintext.length === 8)
  		            throw new Error('8-byte keys not allowed in AESKW, use AESKWP instead');
  		        const out = (0, utils_ts_1.concatBytes)(AESKW_IV, plaintext);
  		        AESW.encrypt(kek, out);
  		        return out;
  		    },
  		    decrypt(ciphertext) {
  		        // ciphertext must be at least 24 bytes and a multiple of 8 bytes
  		        // 24 because should have at least two block (1 iv + 2).
  		        // Replace with 16 to enable '8-byte keys'
  		        if (ciphertext.length % 8 !== 0 || ciphertext.length < 3 * 8)
  		            throw new Error('invalid ciphertext length');
  		        const out = (0, utils_ts_1.copyBytes)(ciphertext);
  		        AESW.decrypt(kek, out);
  		        if (!(0, utils_ts_1.equalBytes)(out.subarray(0, 8), AESKW_IV))
  		            throw new Error('integrity check failed');
  		        out.subarray(0, 8).fill(0); // ciphertext.subarray(0, 8) === IV, but we clean it anyway
  		        return out.subarray(8);
  		    },
  		}));
  		/*
  		We don't support 8-byte keys. The rabbit hole:

  		- Wycheproof says: "NIST SP 800-38F does not define the wrapping of 8 byte keys.
  		  RFC 3394 Section 2  on the other hand specifies that 8 byte keys are wrapped
  		  by directly encrypting one block with AES."
  		    - https://github.com/C2SP/wycheproof/blob/master/doc/key_wrap.md
  		    - "RFC 3394 specifies in Section 2, that the input for the key wrap
  		      algorithm must be at least two blocks and otherwise the constant
  		      field and key are simply encrypted with ECB as a single block"
  		- What RFC 3394 actually says (in Section 2):
  		    - "Before being wrapped, the key data is parsed into n blocks of 64 bits.
  		      The only restriction the key wrap algorithm places on n is that n be
  		      at least two"
  		    - "For key data with length less than or equal to 64 bits, the constant
  		      field used in this specification and the key data form a single
  		      128-bit codebook input making this key wrap unnecessary."
  		- Which means "assert(n >= 2)" and "use something else for 8 byte keys"
  		- NIST SP800-38F actually prohibits 8-byte in "5.3.1 Mandatory Limits".
  		  It states that plaintext for KW should be "2 to 2^54 -1 semiblocks".
  		- So, where does "directly encrypt single block with AES" come from?
  		    - Not RFC 3394. Pseudocode of key wrap in 2.2 explicitly uses
  		      loop of 6 for any code path
  		    - There is a weird W3C spec:
  		      https://www.w3.org/TR/2002/REC-xmlenc-core-20021210/Overview.html#kw-aes128
  		    - This spec is outdated, as admitted by Wycheproof authors
  		    - There is RFC 5649 for padded key wrap, which is padding construction on
  		      top of AESKW. In '4.1.2' it says: "If the padded plaintext contains exactly
  		      eight octets, then prepend the AIV as defined in Section 3 above to P[1] and
  		      encrypt the resulting 128-bit block using AES in ECB mode [Modes] with key
  		      K (the KEK).  In this case, the output is two 64-bit blocks C[0] and C[1]:"
  		    - Browser subtle crypto is actually crashes on wrapping keys less than 16 bytes:
  		      `Error: error:1C8000E6:Provider routines::invalid input length] { opensslErrorStack: [ 'error:030000BD:digital envelope routines::update error' ]`

  		In the end, seems like a bug in Wycheproof.
  		The 8-byte check can be easily disabled inside of AES_W.
  		*/
  		const AESKWP_IV = 0xa65959a6; // single u32le value
  		/**
  		 * AES-KW, but with padding and allows random keys.
  		 * Second u32 of IV is used as counter for length.
  		 * [RFC 5649](https://www.rfc-editor.org/rfc/rfc5649)
  		 */
  		exports.aeskwp = (0, utils_ts_1.wrapCipher)({ blockSize: 8 }, (kek) => ({
  		    encrypt(plaintext) {
  		        if (!plaintext.length)
  		            throw new Error('invalid plaintext length');
  		        const padded = Math.ceil(plaintext.length / 8) * 8;
  		        const out = new Uint8Array(8 + padded);
  		        out.set(plaintext, 8);
  		        const out32 = (0, utils_ts_1.u32)(out);
  		        out32[0] = AESKWP_IV;
  		        out32[1] = byteSwap(plaintext.length);
  		        AESW.encrypt(kek, out);
  		        return out;
  		    },
  		    decrypt(ciphertext) {
  		        // 16 because should have at least one block
  		        if (ciphertext.length < 16)
  		            throw new Error('invalid ciphertext length');
  		        const out = (0, utils_ts_1.copyBytes)(ciphertext);
  		        const o32 = (0, utils_ts_1.u32)(out);
  		        AESW.decrypt(kek, out);
  		        const len = byteSwap(o32[1]) >>> 0;
  		        const padded = Math.ceil(len / 8) * 8;
  		        if (o32[0] !== AESKWP_IV || out.length - 8 !== padded)
  		            throw new Error('integrity check failed');
  		        for (let i = len; i < padded; i++)
  		            if (out[8 + i] !== 0)
  		                throw new Error('integrity check failed');
  		        out.subarray(0, 8).fill(0); // ciphertext.subarray(0, 8) === IV, but we clean it anyway
  		        return out.subarray(8, 8 + len);
  		    },
  		}));
  		/** Unsafe low-level internal methods. May change at any time. */
  		exports.unsafe = {
  		    expandKeyLE,
  		    expandKeyDecLE,
  		    encrypt,
  		    decrypt,
  		    encryptBlock,
  		    decryptBlock,
  		    ctrCounter,
  		    ctr32,
  		};
  		
  	} (aes));
  	return aes;
  }

  var hasRequiredNoble$1;

  function requireNoble$1 () {
  	if (hasRequiredNoble$1) return noble$1;
  	hasRequiredNoble$1 = 1;
  	Object.defineProperty(noble$1, "__esModule", { value: true });
  	noble$1.aes256cbc = noble$1.aes256gcm = void 0;
  	var aes_1 = /*@__PURE__*/ requireAes();
  	var aes256gcm = function (key, nonce, AAD) {
  	    return (0, aes_1.gcm)(key, nonce, AAD);
  	};
  	noble$1.aes256gcm = aes256gcm;
  	var aes256cbc = function (key, nonce, AAD) {
  	    return (0, aes_1.cbc)(key, nonce);
  	};
  	noble$1.aes256cbc = aes256cbc;
  	return noble$1;
  }

  var noble = {};

  var chacha = {};

  var _arx = {};

  var hasRequired_arx;

  function require_arx () {
  	if (hasRequired_arx) return _arx;
  	hasRequired_arx = 1;
  	Object.defineProperty(_arx, "__esModule", { value: true });
  	_arx.rotl = rotl;
  	_arx.createCipher = createCipher;
  	/**
  	 * Basic utils for ARX (add-rotate-xor) salsa and chacha ciphers.

  	RFC8439 requires multi-step cipher stream, where
  	authKey starts with counter: 0, actual msg with counter: 1.

  	For this, we need a way to re-use nonce / counter:

  	    const counter = new Uint8Array(4);
  	    chacha(..., counter, ...); // counter is now 1
  	    chacha(..., counter, ...); // counter is now 2

  	This is complicated:

  	- 32-bit counters are enough, no need for 64-bit: max ArrayBuffer size in JS is 4GB
  	- Original papers don't allow mutating counters
  	- Counter overflow is undefined [^1]
  	- Idea A: allow providing (nonce | counter) instead of just nonce, re-use it
  	- Caveat: Cannot be re-used through all cases:
  	- * chacha has (counter | nonce)
  	- * xchacha has (nonce16 | counter | nonce16)
  	- Idea B: separate nonce / counter and provide separate API for counter re-use
  	- Caveat: there are different counter sizes depending on an algorithm.
  	- salsa & chacha also differ in structures of key & sigma:
  	  salsa20:      s[0] | k(4) | s[1] | nonce(2) | ctr(2) | s[2] | k(4) | s[3]
  	  chacha:       s(4) | k(8) | ctr(1) | nonce(3)
  	  chacha20orig: s(4) | k(8) | ctr(2) | nonce(2)
  	- Idea C: helper method such as `setSalsaState(key, nonce, sigma, data)`
  	- Caveat: we can't re-use counter array

  	xchacha [^2] uses the subkey and remaining 8 byte nonce with ChaCha20 as normal
  	(prefixed by 4 NUL bytes, since [RFC8439] specifies a 12-byte nonce).

  	[^1]: https://mailarchive.ietf.org/arch/msg/cfrg/gsOnTJzcbgG6OqD8Sc0GO5aR_tU/
  	[^2]: https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha#appendix-A.2

  	 * @module
  	 */
  	// prettier-ignore
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$3();
  	// We can't make top-level var depend on utils.utf8ToBytes
  	// because it's not present in all envs. Creating a similar fn here
  	const _utf8ToBytes = (str) => Uint8Array.from(str.split('').map((c) => c.charCodeAt(0)));
  	const sigma16 = _utf8ToBytes('expand 16-byte k');
  	const sigma32 = _utf8ToBytes('expand 32-byte k');
  	const sigma16_32 = (0, utils_ts_1.u32)(sigma16);
  	const sigma32_32 = (0, utils_ts_1.u32)(sigma32);
  	function rotl(a, b) {
  	    return (a << b) | (a >>> (32 - b));
  	}
  	// Is byte array aligned to 4 byte offset (u32)?
  	function isAligned32(b) {
  	    return b.byteOffset % 4 === 0;
  	}
  	// Salsa and Chacha block length is always 512-bit
  	const BLOCK_LEN = 64;
  	const BLOCK_LEN32 = 16;
  	// new Uint32Array([2**32])   // => Uint32Array(1) [ 0 ]
  	// new Uint32Array([2**32-1]) // => Uint32Array(1) [ 4294967295 ]
  	const MAX_COUNTER = 2 ** 32 - 1;
  	const U32_EMPTY = new Uint32Array();
  	function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
  	    const len = data.length;
  	    const block = new Uint8Array(BLOCK_LEN);
  	    const b32 = (0, utils_ts_1.u32)(block);
  	    // Make sure that buffers aligned to 4 bytes
  	    const isAligned = isAligned32(data) && isAligned32(output);
  	    const d32 = isAligned ? (0, utils_ts_1.u32)(data) : U32_EMPTY;
  	    const o32 = isAligned ? (0, utils_ts_1.u32)(output) : U32_EMPTY;
  	    for (let pos = 0; pos < len; counter++) {
  	        core(sigma, key, nonce, b32, counter, rounds);
  	        if (counter >= MAX_COUNTER)
  	            throw new Error('arx: counter overflow');
  	        const take = Math.min(BLOCK_LEN, len - pos);
  	        // aligned to 4 bytes
  	        if (isAligned && take === BLOCK_LEN) {
  	            const pos32 = pos / 4;
  	            if (pos % 4 !== 0)
  	                throw new Error('arx: invalid block position');
  	            for (let j = 0, posj; j < BLOCK_LEN32; j++) {
  	                posj = pos32 + j;
  	                o32[posj] = d32[posj] ^ b32[j];
  	            }
  	            pos += BLOCK_LEN;
  	            continue;
  	        }
  	        for (let j = 0, posj; j < take; j++) {
  	            posj = pos + j;
  	            output[posj] = data[posj] ^ block[j];
  	        }
  	        pos += take;
  	    }
  	}
  	/** Creates ARX-like (ChaCha, Salsa) cipher stream from core function. */
  	function createCipher(core, opts) {
  	    const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = (0, utils_ts_1.checkOpts)({ allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 }, opts);
  	    if (typeof core !== 'function')
  	        throw new Error('core must be a function');
  	    (0, utils_ts_1.anumber)(counterLength);
  	    (0, utils_ts_1.anumber)(rounds);
  	    (0, utils_ts_1.abool)(counterRight);
  	    (0, utils_ts_1.abool)(allowShortKeys);
  	    return (key, nonce, data, output, counter = 0) => {
  	        (0, utils_ts_1.abytes)(key);
  	        (0, utils_ts_1.abytes)(nonce);
  	        (0, utils_ts_1.abytes)(data);
  	        const len = data.length;
  	        if (output === undefined)
  	            output = new Uint8Array(len);
  	        (0, utils_ts_1.abytes)(output);
  	        (0, utils_ts_1.anumber)(counter);
  	        if (counter < 0 || counter >= MAX_COUNTER)
  	            throw new Error('arx: counter overflow');
  	        if (output.length < len)
  	            throw new Error(`arx: output (${output.length}) is shorter than data (${len})`);
  	        const toClean = [];
  	        // Key & sigma
  	        // key=16 -> sigma16, k=key|key
  	        // key=32 -> sigma32, k=key
  	        let l = key.length;
  	        let k;
  	        let sigma;
  	        if (l === 32) {
  	            toClean.push((k = (0, utils_ts_1.copyBytes)(key)));
  	            sigma = sigma32_32;
  	        }
  	        else if (l === 16 && allowShortKeys) {
  	            k = new Uint8Array(32);
  	            k.set(key);
  	            k.set(key, 16);
  	            sigma = sigma16_32;
  	            toClean.push(k);
  	        }
  	        else {
  	            throw new Error(`arx: invalid 32-byte key, got length=${l}`);
  	        }
  	        // Nonce
  	        // salsa20:      8   (8-byte counter)
  	        // chacha20orig: 8   (8-byte counter)
  	        // chacha20:     12  (4-byte counter)
  	        // xsalsa20:     24  (16 -> hsalsa,  8 -> old nonce)
  	        // xchacha20:    24  (16 -> hchacha, 8 -> old nonce)
  	        // Align nonce to 4 bytes
  	        if (!isAligned32(nonce))
  	            toClean.push((nonce = (0, utils_ts_1.copyBytes)(nonce)));
  	        const k32 = (0, utils_ts_1.u32)(k);
  	        // hsalsa & hchacha: handle extended nonce
  	        if (extendNonceFn) {
  	            if (nonce.length !== 24)
  	                throw new Error(`arx: extended nonce must be 24 bytes`);
  	            extendNonceFn(sigma, k32, (0, utils_ts_1.u32)(nonce.subarray(0, 16)), k32);
  	            nonce = nonce.subarray(16);
  	        }
  	        // Handle nonce counter
  	        const nonceNcLen = 16 - counterLength;
  	        if (nonceNcLen !== nonce.length)
  	            throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
  	        // Pad counter when nonce is 64 bit
  	        if (nonceNcLen !== 12) {
  	            const nc = new Uint8Array(12);
  	            nc.set(nonce, counterRight ? 0 : 12 - nonce.length);
  	            nonce = nc;
  	            toClean.push(nonce);
  	        }
  	        const n32 = (0, utils_ts_1.u32)(nonce);
  	        runCipher(core, sigma, k32, n32, data, output, counter, rounds);
  	        (0, utils_ts_1.clean)(...toClean);
  	        return output;
  	    };
  	}
  	
  	return _arx;
  }

  var _poly1305 = {};

  var hasRequired_poly1305;

  function require_poly1305 () {
  	if (hasRequired_poly1305) return _poly1305;
  	hasRequired_poly1305 = 1;
  	Object.defineProperty(_poly1305, "__esModule", { value: true });
  	_poly1305.poly1305 = void 0;
  	_poly1305.wrapConstructorWithKey = wrapConstructorWithKey;
  	/**
  	 * Poly1305 ([PDF](https://cr.yp.to/mac/poly1305-20050329.pdf),
  	 * [wiki](https://en.wikipedia.org/wiki/Poly1305))
  	 * is a fast and parallel secret-key message-authentication code suitable for
  	 * a wide variety of applications. It was standardized in
  	 * [RFC 8439](https://datatracker.ietf.org/doc/html/rfc8439) and is now used in TLS 1.3.
  	 *
  	 * Polynomial MACs are not perfect for every situation:
  	 * they lack Random Key Robustness: the MAC can be forged, and can't be used in PAKE schemes.
  	 * See [invisible salamanders attack](https://keymaterial.net/2020/09/07/invisible-salamanders-in-aes-gcm-siv/).
  	 * To combat invisible salamanders, `hash(key)` can be included in ciphertext,
  	 * however, this would violate ciphertext indistinguishability:
  	 * an attacker would know which key was used - so `HKDF(key, i)`
  	 * could be used instead.
  	 *
  	 * Check out [original website](https://cr.yp.to/mac.html).
  	 * @module
  	 */
  	const utils_ts_1 = /*@__PURE__*/ requireUtils$3();
  	// Based on Public Domain poly1305-donna https://github.com/floodyberry/poly1305-donna
  	const u8to16 = (a, i) => (a[i++] & 0xff) | ((a[i++] & 0xff) << 8);
  	class Poly1305 {
  	    constructor(key) {
  	        this.blockLen = 16;
  	        this.outputLen = 16;
  	        this.buffer = new Uint8Array(16);
  	        this.r = new Uint16Array(10);
  	        this.h = new Uint16Array(10);
  	        this.pad = new Uint16Array(8);
  	        this.pos = 0;
  	        this.finished = false;
  	        key = (0, utils_ts_1.toBytes)(key);
  	        (0, utils_ts_1.abytes)(key, 32);
  	        const t0 = u8to16(key, 0);
  	        const t1 = u8to16(key, 2);
  	        const t2 = u8to16(key, 4);
  	        const t3 = u8to16(key, 6);
  	        const t4 = u8to16(key, 8);
  	        const t5 = u8to16(key, 10);
  	        const t6 = u8to16(key, 12);
  	        const t7 = u8to16(key, 14);
  	        // https://github.com/floodyberry/poly1305-donna/blob/e6ad6e091d30d7f4ec2d4f978be1fcfcbce72781/poly1305-donna-16.h#L47
  	        this.r[0] = t0 & 0x1fff;
  	        this.r[1] = ((t0 >>> 13) | (t1 << 3)) & 0x1fff;
  	        this.r[2] = ((t1 >>> 10) | (t2 << 6)) & 0x1f03;
  	        this.r[3] = ((t2 >>> 7) | (t3 << 9)) & 0x1fff;
  	        this.r[4] = ((t3 >>> 4) | (t4 << 12)) & 0x00ff;
  	        this.r[5] = (t4 >>> 1) & 0x1ffe;
  	        this.r[6] = ((t4 >>> 14) | (t5 << 2)) & 0x1fff;
  	        this.r[7] = ((t5 >>> 11) | (t6 << 5)) & 0x1f81;
  	        this.r[8] = ((t6 >>> 8) | (t7 << 8)) & 0x1fff;
  	        this.r[9] = (t7 >>> 5) & 0x007f;
  	        for (let i = 0; i < 8; i++)
  	            this.pad[i] = u8to16(key, 16 + 2 * i);
  	    }
  	    process(data, offset, isLast = false) {
  	        const hibit = isLast ? 0 : 1 << 11;
  	        const { h, r } = this;
  	        const r0 = r[0];
  	        const r1 = r[1];
  	        const r2 = r[2];
  	        const r3 = r[3];
  	        const r4 = r[4];
  	        const r5 = r[5];
  	        const r6 = r[6];
  	        const r7 = r[7];
  	        const r8 = r[8];
  	        const r9 = r[9];
  	        const t0 = u8to16(data, offset + 0);
  	        const t1 = u8to16(data, offset + 2);
  	        const t2 = u8to16(data, offset + 4);
  	        const t3 = u8to16(data, offset + 6);
  	        const t4 = u8to16(data, offset + 8);
  	        const t5 = u8to16(data, offset + 10);
  	        const t6 = u8to16(data, offset + 12);
  	        const t7 = u8to16(data, offset + 14);
  	        let h0 = h[0] + (t0 & 0x1fff);
  	        let h1 = h[1] + (((t0 >>> 13) | (t1 << 3)) & 0x1fff);
  	        let h2 = h[2] + (((t1 >>> 10) | (t2 << 6)) & 0x1fff);
  	        let h3 = h[3] + (((t2 >>> 7) | (t3 << 9)) & 0x1fff);
  	        let h4 = h[4] + (((t3 >>> 4) | (t4 << 12)) & 0x1fff);
  	        let h5 = h[5] + ((t4 >>> 1) & 0x1fff);
  	        let h6 = h[6] + (((t4 >>> 14) | (t5 << 2)) & 0x1fff);
  	        let h7 = h[7] + (((t5 >>> 11) | (t6 << 5)) & 0x1fff);
  	        let h8 = h[8] + (((t6 >>> 8) | (t7 << 8)) & 0x1fff);
  	        let h9 = h[9] + ((t7 >>> 5) | hibit);
  	        let c = 0;
  	        let d0 = c + h0 * r0 + h1 * (5 * r9) + h2 * (5 * r8) + h3 * (5 * r7) + h4 * (5 * r6);
  	        c = d0 >>> 13;
  	        d0 &= 0x1fff;
  	        d0 += h5 * (5 * r5) + h6 * (5 * r4) + h7 * (5 * r3) + h8 * (5 * r2) + h9 * (5 * r1);
  	        c += d0 >>> 13;
  	        d0 &= 0x1fff;
  	        let d1 = c + h0 * r1 + h1 * r0 + h2 * (5 * r9) + h3 * (5 * r8) + h4 * (5 * r7);
  	        c = d1 >>> 13;
  	        d1 &= 0x1fff;
  	        d1 += h5 * (5 * r6) + h6 * (5 * r5) + h7 * (5 * r4) + h8 * (5 * r3) + h9 * (5 * r2);
  	        c += d1 >>> 13;
  	        d1 &= 0x1fff;
  	        let d2 = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * (5 * r9) + h4 * (5 * r8);
  	        c = d2 >>> 13;
  	        d2 &= 0x1fff;
  	        d2 += h5 * (5 * r7) + h6 * (5 * r6) + h7 * (5 * r5) + h8 * (5 * r4) + h9 * (5 * r3);
  	        c += d2 >>> 13;
  	        d2 &= 0x1fff;
  	        let d3 = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * (5 * r9);
  	        c = d3 >>> 13;
  	        d3 &= 0x1fff;
  	        d3 += h5 * (5 * r8) + h6 * (5 * r7) + h7 * (5 * r6) + h8 * (5 * r5) + h9 * (5 * r4);
  	        c += d3 >>> 13;
  	        d3 &= 0x1fff;
  	        let d4 = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0;
  	        c = d4 >>> 13;
  	        d4 &= 0x1fff;
  	        d4 += h5 * (5 * r9) + h6 * (5 * r8) + h7 * (5 * r7) + h8 * (5 * r6) + h9 * (5 * r5);
  	        c += d4 >>> 13;
  	        d4 &= 0x1fff;
  	        let d5 = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1;
  	        c = d5 >>> 13;
  	        d5 &= 0x1fff;
  	        d5 += h5 * r0 + h6 * (5 * r9) + h7 * (5 * r8) + h8 * (5 * r7) + h9 * (5 * r6);
  	        c += d5 >>> 13;
  	        d5 &= 0x1fff;
  	        let d6 = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2;
  	        c = d6 >>> 13;
  	        d6 &= 0x1fff;
  	        d6 += h5 * r1 + h6 * r0 + h7 * (5 * r9) + h8 * (5 * r8) + h9 * (5 * r7);
  	        c += d6 >>> 13;
  	        d6 &= 0x1fff;
  	        let d7 = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3;
  	        c = d7 >>> 13;
  	        d7 &= 0x1fff;
  	        d7 += h5 * r2 + h6 * r1 + h7 * r0 + h8 * (5 * r9) + h9 * (5 * r8);
  	        c += d7 >>> 13;
  	        d7 &= 0x1fff;
  	        let d8 = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4;
  	        c = d8 >>> 13;
  	        d8 &= 0x1fff;
  	        d8 += h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * (5 * r9);
  	        c += d8 >>> 13;
  	        d8 &= 0x1fff;
  	        let d9 = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5;
  	        c = d9 >>> 13;
  	        d9 &= 0x1fff;
  	        d9 += h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
  	        c += d9 >>> 13;
  	        d9 &= 0x1fff;
  	        c = ((c << 2) + c) | 0;
  	        c = (c + d0) | 0;
  	        d0 = c & 0x1fff;
  	        c = c >>> 13;
  	        d1 += c;
  	        h[0] = d0;
  	        h[1] = d1;
  	        h[2] = d2;
  	        h[3] = d3;
  	        h[4] = d4;
  	        h[5] = d5;
  	        h[6] = d6;
  	        h[7] = d7;
  	        h[8] = d8;
  	        h[9] = d9;
  	    }
  	    finalize() {
  	        const { h, pad } = this;
  	        const g = new Uint16Array(10);
  	        let c = h[1] >>> 13;
  	        h[1] &= 0x1fff;
  	        for (let i = 2; i < 10; i++) {
  	            h[i] += c;
  	            c = h[i] >>> 13;
  	            h[i] &= 0x1fff;
  	        }
  	        h[0] += c * 5;
  	        c = h[0] >>> 13;
  	        h[0] &= 0x1fff;
  	        h[1] += c;
  	        c = h[1] >>> 13;
  	        h[1] &= 0x1fff;
  	        h[2] += c;
  	        g[0] = h[0] + 5;
  	        c = g[0] >>> 13;
  	        g[0] &= 0x1fff;
  	        for (let i = 1; i < 10; i++) {
  	            g[i] = h[i] + c;
  	            c = g[i] >>> 13;
  	            g[i] &= 0x1fff;
  	        }
  	        g[9] -= 1 << 13;
  	        let mask = (c ^ 1) - 1;
  	        for (let i = 0; i < 10; i++)
  	            g[i] &= mask;
  	        mask = ~mask;
  	        for (let i = 0; i < 10; i++)
  	            h[i] = (h[i] & mask) | g[i];
  	        h[0] = (h[0] | (h[1] << 13)) & 0xffff;
  	        h[1] = ((h[1] >>> 3) | (h[2] << 10)) & 0xffff;
  	        h[2] = ((h[2] >>> 6) | (h[3] << 7)) & 0xffff;
  	        h[3] = ((h[3] >>> 9) | (h[4] << 4)) & 0xffff;
  	        h[4] = ((h[4] >>> 12) | (h[5] << 1) | (h[6] << 14)) & 0xffff;
  	        h[5] = ((h[6] >>> 2) | (h[7] << 11)) & 0xffff;
  	        h[6] = ((h[7] >>> 5) | (h[8] << 8)) & 0xffff;
  	        h[7] = ((h[8] >>> 8) | (h[9] << 5)) & 0xffff;
  	        let f = h[0] + pad[0];
  	        h[0] = f & 0xffff;
  	        for (let i = 1; i < 8; i++) {
  	            f = (((h[i] + pad[i]) | 0) + (f >>> 16)) | 0;
  	            h[i] = f & 0xffff;
  	        }
  	        (0, utils_ts_1.clean)(g);
  	    }
  	    update(data) {
  	        (0, utils_ts_1.aexists)(this);
  	        data = (0, utils_ts_1.toBytes)(data);
  	        (0, utils_ts_1.abytes)(data);
  	        const { buffer, blockLen } = this;
  	        const len = data.length;
  	        for (let pos = 0; pos < len;) {
  	            const take = Math.min(blockLen - this.pos, len - pos);
  	            // Fast path: we have at least one block in input
  	            if (take === blockLen) {
  	                for (; blockLen <= len - pos; pos += blockLen)
  	                    this.process(data, pos);
  	                continue;
  	            }
  	            buffer.set(data.subarray(pos, pos + take), this.pos);
  	            this.pos += take;
  	            pos += take;
  	            if (this.pos === blockLen) {
  	                this.process(buffer, 0, false);
  	                this.pos = 0;
  	            }
  	        }
  	        return this;
  	    }
  	    destroy() {
  	        (0, utils_ts_1.clean)(this.h, this.r, this.buffer, this.pad);
  	    }
  	    digestInto(out) {
  	        (0, utils_ts_1.aexists)(this);
  	        (0, utils_ts_1.aoutput)(out, this);
  	        this.finished = true;
  	        const { buffer, h } = this;
  	        let { pos } = this;
  	        if (pos) {
  	            buffer[pos++] = 1;
  	            for (; pos < 16; pos++)
  	                buffer[pos] = 0;
  	            this.process(buffer, 0, true);
  	        }
  	        this.finalize();
  	        let opos = 0;
  	        for (let i = 0; i < 8; i++) {
  	            out[opos++] = h[i] >>> 0;
  	            out[opos++] = h[i] >>> 8;
  	        }
  	        return out;
  	    }
  	    digest() {
  	        const { buffer, outputLen } = this;
  	        this.digestInto(buffer);
  	        const res = buffer.slice(0, outputLen);
  	        this.destroy();
  	        return res;
  	    }
  	}
  	function wrapConstructorWithKey(hashCons) {
  	    const hashC = (msg, key) => hashCons(key).update((0, utils_ts_1.toBytes)(msg)).digest();
  	    const tmp = hashCons(new Uint8Array(32));
  	    hashC.outputLen = tmp.outputLen;
  	    hashC.blockLen = tmp.blockLen;
  	    hashC.create = (key) => hashCons(key);
  	    return hashC;
  	}
  	/** Poly1305 MAC from RFC 8439. */
  	_poly1305.poly1305 = wrapConstructorWithKey((key) => new Poly1305(key));
  	
  	return _poly1305;
  }

  var hasRequiredChacha;

  function requireChacha () {
  	if (hasRequiredChacha) return chacha;
  	hasRequiredChacha = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.xchacha20poly1305 = exports.chacha20poly1305 = exports._poly1305_aead = exports.chacha12 = exports.chacha8 = exports.xchacha20 = exports.chacha20 = exports.chacha20orig = void 0;
  		exports.hchacha = hchacha;
  		/**
  		 * [ChaCha20](https://cr.yp.to/chacha.html) stream cipher, released
  		 * in 2008. Developed after Salsa20, ChaCha aims to increase diffusion per round.
  		 * It was standardized in [RFC 8439](https://datatracker.ietf.org/doc/html/rfc8439) and
  		 * is now used in TLS 1.3.
  		 *
  		 * [XChaCha20](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha)
  		 * extended-nonce variant is also provided. Similar to XSalsa, it's safe to use with
  		 * randomly-generated nonces.
  		 *
  		 * Check out [PDF](http://cr.yp.to/chacha/chacha-20080128.pdf) and
  		 * [wiki](https://en.wikipedia.org/wiki/Salsa20).
  		 * @module
  		 */
  		const _arx_ts_1 = /*@__PURE__*/ require_arx();
  		const _poly1305_ts_1 = /*@__PURE__*/ require_poly1305();
  		const utils_ts_1 = /*@__PURE__*/ requireUtils$3();
  		/**
  		 * ChaCha core function.
  		 */
  		// prettier-ignore
  		function chachaCore(s, k, n, out, cnt, rounds = 20) {
  		    let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], // "expa"   "nd 3"  "2-by"  "te k"
  		    y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], // Key      Key     Key     Key
  		    y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], // Key      Key     Key     Key
  		    y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2]; // Counter  Counter	Nonce   Nonce
  		    // Save state to temporary variables
  		    let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
  		    for (let r = 0; r < rounds; r += 2) {
  		        x00 = (x00 + x04) | 0;
  		        x12 = (0, _arx_ts_1.rotl)(x12 ^ x00, 16);
  		        x08 = (x08 + x12) | 0;
  		        x04 = (0, _arx_ts_1.rotl)(x04 ^ x08, 12);
  		        x00 = (x00 + x04) | 0;
  		        x12 = (0, _arx_ts_1.rotl)(x12 ^ x00, 8);
  		        x08 = (x08 + x12) | 0;
  		        x04 = (0, _arx_ts_1.rotl)(x04 ^ x08, 7);
  		        x01 = (x01 + x05) | 0;
  		        x13 = (0, _arx_ts_1.rotl)(x13 ^ x01, 16);
  		        x09 = (x09 + x13) | 0;
  		        x05 = (0, _arx_ts_1.rotl)(x05 ^ x09, 12);
  		        x01 = (x01 + x05) | 0;
  		        x13 = (0, _arx_ts_1.rotl)(x13 ^ x01, 8);
  		        x09 = (x09 + x13) | 0;
  		        x05 = (0, _arx_ts_1.rotl)(x05 ^ x09, 7);
  		        x02 = (x02 + x06) | 0;
  		        x14 = (0, _arx_ts_1.rotl)(x14 ^ x02, 16);
  		        x10 = (x10 + x14) | 0;
  		        x06 = (0, _arx_ts_1.rotl)(x06 ^ x10, 12);
  		        x02 = (x02 + x06) | 0;
  		        x14 = (0, _arx_ts_1.rotl)(x14 ^ x02, 8);
  		        x10 = (x10 + x14) | 0;
  		        x06 = (0, _arx_ts_1.rotl)(x06 ^ x10, 7);
  		        x03 = (x03 + x07) | 0;
  		        x15 = (0, _arx_ts_1.rotl)(x15 ^ x03, 16);
  		        x11 = (x11 + x15) | 0;
  		        x07 = (0, _arx_ts_1.rotl)(x07 ^ x11, 12);
  		        x03 = (x03 + x07) | 0;
  		        x15 = (0, _arx_ts_1.rotl)(x15 ^ x03, 8);
  		        x11 = (x11 + x15) | 0;
  		        x07 = (0, _arx_ts_1.rotl)(x07 ^ x11, 7);
  		        x00 = (x00 + x05) | 0;
  		        x15 = (0, _arx_ts_1.rotl)(x15 ^ x00, 16);
  		        x10 = (x10 + x15) | 0;
  		        x05 = (0, _arx_ts_1.rotl)(x05 ^ x10, 12);
  		        x00 = (x00 + x05) | 0;
  		        x15 = (0, _arx_ts_1.rotl)(x15 ^ x00, 8);
  		        x10 = (x10 + x15) | 0;
  		        x05 = (0, _arx_ts_1.rotl)(x05 ^ x10, 7);
  		        x01 = (x01 + x06) | 0;
  		        x12 = (0, _arx_ts_1.rotl)(x12 ^ x01, 16);
  		        x11 = (x11 + x12) | 0;
  		        x06 = (0, _arx_ts_1.rotl)(x06 ^ x11, 12);
  		        x01 = (x01 + x06) | 0;
  		        x12 = (0, _arx_ts_1.rotl)(x12 ^ x01, 8);
  		        x11 = (x11 + x12) | 0;
  		        x06 = (0, _arx_ts_1.rotl)(x06 ^ x11, 7);
  		        x02 = (x02 + x07) | 0;
  		        x13 = (0, _arx_ts_1.rotl)(x13 ^ x02, 16);
  		        x08 = (x08 + x13) | 0;
  		        x07 = (0, _arx_ts_1.rotl)(x07 ^ x08, 12);
  		        x02 = (x02 + x07) | 0;
  		        x13 = (0, _arx_ts_1.rotl)(x13 ^ x02, 8);
  		        x08 = (x08 + x13) | 0;
  		        x07 = (0, _arx_ts_1.rotl)(x07 ^ x08, 7);
  		        x03 = (x03 + x04) | 0;
  		        x14 = (0, _arx_ts_1.rotl)(x14 ^ x03, 16);
  		        x09 = (x09 + x14) | 0;
  		        x04 = (0, _arx_ts_1.rotl)(x04 ^ x09, 12);
  		        x03 = (x03 + x04) | 0;
  		        x14 = (0, _arx_ts_1.rotl)(x14 ^ x03, 8);
  		        x09 = (x09 + x14) | 0;
  		        x04 = (0, _arx_ts_1.rotl)(x04 ^ x09, 7);
  		    }
  		    // Write output
  		    let oi = 0;
  		    out[oi++] = (y00 + x00) | 0;
  		    out[oi++] = (y01 + x01) | 0;
  		    out[oi++] = (y02 + x02) | 0;
  		    out[oi++] = (y03 + x03) | 0;
  		    out[oi++] = (y04 + x04) | 0;
  		    out[oi++] = (y05 + x05) | 0;
  		    out[oi++] = (y06 + x06) | 0;
  		    out[oi++] = (y07 + x07) | 0;
  		    out[oi++] = (y08 + x08) | 0;
  		    out[oi++] = (y09 + x09) | 0;
  		    out[oi++] = (y10 + x10) | 0;
  		    out[oi++] = (y11 + x11) | 0;
  		    out[oi++] = (y12 + x12) | 0;
  		    out[oi++] = (y13 + x13) | 0;
  		    out[oi++] = (y14 + x14) | 0;
  		    out[oi++] = (y15 + x15) | 0;
  		}
  		/**
  		 * hchacha helper method, used primarily in xchacha, to hash
  		 * key and nonce into key' and nonce'.
  		 * Same as chachaCore, but there doesn't seem to be a way to move the block
  		 * out without 25% performance hit.
  		 */
  		// prettier-ignore
  		function hchacha(s, k, i, o32) {
  		    let x00 = s[0], x01 = s[1], x02 = s[2], x03 = s[3], x04 = k[0], x05 = k[1], x06 = k[2], x07 = k[3], x08 = k[4], x09 = k[5], x10 = k[6], x11 = k[7], x12 = i[0], x13 = i[1], x14 = i[2], x15 = i[3];
  		    for (let r = 0; r < 20; r += 2) {
  		        x00 = (x00 + x04) | 0;
  		        x12 = (0, _arx_ts_1.rotl)(x12 ^ x00, 16);
  		        x08 = (x08 + x12) | 0;
  		        x04 = (0, _arx_ts_1.rotl)(x04 ^ x08, 12);
  		        x00 = (x00 + x04) | 0;
  		        x12 = (0, _arx_ts_1.rotl)(x12 ^ x00, 8);
  		        x08 = (x08 + x12) | 0;
  		        x04 = (0, _arx_ts_1.rotl)(x04 ^ x08, 7);
  		        x01 = (x01 + x05) | 0;
  		        x13 = (0, _arx_ts_1.rotl)(x13 ^ x01, 16);
  		        x09 = (x09 + x13) | 0;
  		        x05 = (0, _arx_ts_1.rotl)(x05 ^ x09, 12);
  		        x01 = (x01 + x05) | 0;
  		        x13 = (0, _arx_ts_1.rotl)(x13 ^ x01, 8);
  		        x09 = (x09 + x13) | 0;
  		        x05 = (0, _arx_ts_1.rotl)(x05 ^ x09, 7);
  		        x02 = (x02 + x06) | 0;
  		        x14 = (0, _arx_ts_1.rotl)(x14 ^ x02, 16);
  		        x10 = (x10 + x14) | 0;
  		        x06 = (0, _arx_ts_1.rotl)(x06 ^ x10, 12);
  		        x02 = (x02 + x06) | 0;
  		        x14 = (0, _arx_ts_1.rotl)(x14 ^ x02, 8);
  		        x10 = (x10 + x14) | 0;
  		        x06 = (0, _arx_ts_1.rotl)(x06 ^ x10, 7);
  		        x03 = (x03 + x07) | 0;
  		        x15 = (0, _arx_ts_1.rotl)(x15 ^ x03, 16);
  		        x11 = (x11 + x15) | 0;
  		        x07 = (0, _arx_ts_1.rotl)(x07 ^ x11, 12);
  		        x03 = (x03 + x07) | 0;
  		        x15 = (0, _arx_ts_1.rotl)(x15 ^ x03, 8);
  		        x11 = (x11 + x15) | 0;
  		        x07 = (0, _arx_ts_1.rotl)(x07 ^ x11, 7);
  		        x00 = (x00 + x05) | 0;
  		        x15 = (0, _arx_ts_1.rotl)(x15 ^ x00, 16);
  		        x10 = (x10 + x15) | 0;
  		        x05 = (0, _arx_ts_1.rotl)(x05 ^ x10, 12);
  		        x00 = (x00 + x05) | 0;
  		        x15 = (0, _arx_ts_1.rotl)(x15 ^ x00, 8);
  		        x10 = (x10 + x15) | 0;
  		        x05 = (0, _arx_ts_1.rotl)(x05 ^ x10, 7);
  		        x01 = (x01 + x06) | 0;
  		        x12 = (0, _arx_ts_1.rotl)(x12 ^ x01, 16);
  		        x11 = (x11 + x12) | 0;
  		        x06 = (0, _arx_ts_1.rotl)(x06 ^ x11, 12);
  		        x01 = (x01 + x06) | 0;
  		        x12 = (0, _arx_ts_1.rotl)(x12 ^ x01, 8);
  		        x11 = (x11 + x12) | 0;
  		        x06 = (0, _arx_ts_1.rotl)(x06 ^ x11, 7);
  		        x02 = (x02 + x07) | 0;
  		        x13 = (0, _arx_ts_1.rotl)(x13 ^ x02, 16);
  		        x08 = (x08 + x13) | 0;
  		        x07 = (0, _arx_ts_1.rotl)(x07 ^ x08, 12);
  		        x02 = (x02 + x07) | 0;
  		        x13 = (0, _arx_ts_1.rotl)(x13 ^ x02, 8);
  		        x08 = (x08 + x13) | 0;
  		        x07 = (0, _arx_ts_1.rotl)(x07 ^ x08, 7);
  		        x03 = (x03 + x04) | 0;
  		        x14 = (0, _arx_ts_1.rotl)(x14 ^ x03, 16);
  		        x09 = (x09 + x14) | 0;
  		        x04 = (0, _arx_ts_1.rotl)(x04 ^ x09, 12);
  		        x03 = (x03 + x04) | 0;
  		        x14 = (0, _arx_ts_1.rotl)(x14 ^ x03, 8);
  		        x09 = (x09 + x14) | 0;
  		        x04 = (0, _arx_ts_1.rotl)(x04 ^ x09, 7);
  		    }
  		    let oi = 0;
  		    o32[oi++] = x00;
  		    o32[oi++] = x01;
  		    o32[oi++] = x02;
  		    o32[oi++] = x03;
  		    o32[oi++] = x12;
  		    o32[oi++] = x13;
  		    o32[oi++] = x14;
  		    o32[oi++] = x15;
  		}
  		/**
  		 * Original, non-RFC chacha20 from DJB. 8-byte nonce, 8-byte counter.
  		 */
  		exports.chacha20orig = (0, _arx_ts_1.createCipher)(chachaCore, {
  		    counterRight: false,
  		    counterLength: 8,
  		    allowShortKeys: true,
  		});
  		/**
  		 * ChaCha stream cipher. Conforms to RFC 8439 (IETF, TLS). 12-byte nonce, 4-byte counter.
  		 * With 12-byte nonce, it's not safe to use fill it with random (CSPRNG), due to collision chance.
  		 */
  		exports.chacha20 = (0, _arx_ts_1.createCipher)(chachaCore, {
  		    counterRight: false,
  		    counterLength: 4,
  		    allowShortKeys: false,
  		});
  		/**
  		 * XChaCha eXtended-nonce ChaCha. 24-byte nonce.
  		 * With 24-byte nonce, it's safe to use fill it with random (CSPRNG).
  		 * https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha
  		 */
  		exports.xchacha20 = (0, _arx_ts_1.createCipher)(chachaCore, {
  		    counterRight: false,
  		    counterLength: 8,
  		    extendNonceFn: hchacha,
  		    allowShortKeys: false,
  		});
  		/**
  		 * Reduced 8-round chacha, described in original paper.
  		 */
  		exports.chacha8 = (0, _arx_ts_1.createCipher)(chachaCore, {
  		    counterRight: false,
  		    counterLength: 4,
  		    rounds: 8,
  		});
  		/**
  		 * Reduced 12-round chacha, described in original paper.
  		 */
  		exports.chacha12 = (0, _arx_ts_1.createCipher)(chachaCore, {
  		    counterRight: false,
  		    counterLength: 4,
  		    rounds: 12,
  		});
  		const ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
  		// Pad to digest size with zeros
  		const updatePadded = (h, msg) => {
  		    h.update(msg);
  		    const left = msg.length % 16;
  		    if (left)
  		        h.update(ZEROS16.subarray(left));
  		};
  		const ZEROS32 = /* @__PURE__ */ new Uint8Array(32);
  		function computeTag(fn, key, nonce, data, AAD) {
  		    const authKey = fn(key, nonce, ZEROS32);
  		    const h = _poly1305_ts_1.poly1305.create(authKey);
  		    if (AAD)
  		        updatePadded(h, AAD);
  		    updatePadded(h, data);
  		    const num = (0, utils_ts_1.u64Lengths)(data.length, AAD ? AAD.length : 0, true);
  		    h.update(num);
  		    const res = h.digest();
  		    (0, utils_ts_1.clean)(authKey, num);
  		    return res;
  		}
  		/**
  		 * AEAD algorithm from RFC 8439.
  		 * Salsa20 and chacha (RFC 8439) use poly1305 differently.
  		 * We could have composed them similar to:
  		 * https://github.com/paulmillr/scure-base/blob/b266c73dde977b1dd7ef40ef7a23cc15aab526b3/index.ts#L250
  		 * But it's hard because of authKey:
  		 * In salsa20, authKey changes position in salsa stream.
  		 * In chacha, authKey can't be computed inside computeTag, it modifies the counter.
  		 */
  		const _poly1305_aead = (xorStream) => (key, nonce, AAD) => {
  		    const tagLength = 16;
  		    return {
  		        encrypt(plaintext, output) {
  		            const plength = plaintext.length;
  		            output = (0, utils_ts_1.getOutput)(plength + tagLength, output, false);
  		            output.set(plaintext);
  		            const oPlain = output.subarray(0, -tagLength);
  		            xorStream(key, nonce, oPlain, oPlain, 1);
  		            const tag = computeTag(xorStream, key, nonce, oPlain, AAD);
  		            output.set(tag, plength); // append tag
  		            (0, utils_ts_1.clean)(tag);
  		            return output;
  		        },
  		        decrypt(ciphertext, output) {
  		            output = (0, utils_ts_1.getOutput)(ciphertext.length - tagLength, output, false);
  		            const data = ciphertext.subarray(0, -tagLength);
  		            const passedTag = ciphertext.subarray(-tagLength);
  		            const tag = computeTag(xorStream, key, nonce, data, AAD);
  		            if (!(0, utils_ts_1.equalBytes)(passedTag, tag))
  		                throw new Error('invalid tag');
  		            output.set(ciphertext.subarray(0, -tagLength));
  		            xorStream(key, nonce, output, output, 1); // start stream with i=1
  		            (0, utils_ts_1.clean)(tag);
  		            return output;
  		        },
  		    };
  		};
  		exports._poly1305_aead = _poly1305_aead;
  		/**
  		 * ChaCha20-Poly1305 from RFC 8439.
  		 *
  		 * Unsafe to use random nonces under the same key, due to collision chance.
  		 * Prefer XChaCha instead.
  		 */
  		exports.chacha20poly1305 = (0, utils_ts_1.wrapCipher)({ blockSize: 64, nonceLength: 12, tagLength: 16 }, (0, exports._poly1305_aead)(exports.chacha20));
  		/**
  		 * XChaCha20-Poly1305 extended-nonce chacha.
  		 *
  		 * Can be safely used with random nonces (CSPRNG).
  		 * See [IRTF draft](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha).
  		 */
  		exports.xchacha20poly1305 = (0, utils_ts_1.wrapCipher)({ blockSize: 64, nonceLength: 24, tagLength: 16 }, (0, exports._poly1305_aead)(exports.xchacha20));
  		
  	} (chacha));
  	return chacha;
  }

  var hasRequiredNoble;

  function requireNoble () {
  	if (hasRequiredNoble) return noble;
  	hasRequiredNoble = 1;
  	Object.defineProperty(noble, "__esModule", { value: true });
  	noble.chacha20 = noble.xchacha20 = void 0;
  	var chacha_1 = /*@__PURE__*/ requireChacha();
  	var xchacha20 = function (key, nonce, AAD) {
  	    return (0, chacha_1.xchacha20poly1305)(key, nonce, AAD);
  	};
  	noble.xchacha20 = xchacha20;
  	var chacha20 = function (key, nonce, AAD) {
  	    return (0, chacha_1.chacha20poly1305)(key, nonce, AAD);
  	};
  	noble.chacha20 = chacha20;
  	return noble;
  }

  var hasRequiredSymmetric;

  function requireSymmetric () {
  	if (hasRequiredSymmetric) return symmetric;
  	hasRequiredSymmetric = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.aesDecrypt = exports.aesEncrypt = exports.symDecrypt = exports.symEncrypt = void 0;
  		var utils_1 = /*@__PURE__*/ requireUtils$3();
  		var webcrypto_1 = /*@__PURE__*/ requireWebcrypto();
  		var aes_1 = requireNoble$1();
  		var chacha_1 = requireNoble();
  		var config_1 = requireConfig();
  		var consts_1 = requireConsts();
  		var symEncrypt = function (key, plainText, AAD) { return _exec(_encrypt, key, plainText, AAD); };
  		exports.symEncrypt = symEncrypt;
  		var symDecrypt = function (key, cipherText, AAD) { return _exec(_decrypt, key, cipherText, AAD); };
  		exports.symDecrypt = symDecrypt;
  		/** @deprecated - use `symEncrypt` instead. */
  		exports.aesEncrypt = exports.symEncrypt; // TODO: delete
  		/** @deprecated - use `symDecrypt` instead. */
  		exports.aesDecrypt = exports.symDecrypt; // TODO: delete
  		function _exec(callback, key, data, AAD) {
  		    var algorithm = (0, config_1.symmetricAlgorithm)();
  		    if (algorithm === "aes-256-gcm") {
  		        return callback(aes_1.aes256gcm, key, data, (0, config_1.symmetricNonceLength)(), consts_1.AEAD_TAG_LENGTH, AAD);
  		    }
  		    else if (algorithm === "xchacha20") {
  		        return callback(chacha_1.xchacha20, key, data, consts_1.XCHACHA20_NONCE_LENGTH, consts_1.AEAD_TAG_LENGTH, AAD);
  		    }
  		    else if (algorithm === "aes-256-cbc") {
  		        // NOT RECOMMENDED. There is neither AAD nor AEAD tag in cbc mode
  		        // aes-256-cbc always uses 16 bytes iv
  		        return callback(aes_1.aes256cbc, key, data, 16, 0);
  		    }
  		    else {
  		        throw new Error("Not implemented");
  		    }
  		}
  		function _encrypt(func, key, data, nonceLength, tagLength, AAD) {
  		    var nonce = (0, webcrypto_1.randomBytes)(nonceLength);
  		    var cipher = func(key, nonce, AAD);
  		    // @noble/ciphers format: cipherText || tag
  		    var encrypted = cipher.encrypt(data);
  		    if (tagLength === 0) {
  		        return (0, utils_1.concatBytes)(nonce, encrypted);
  		    }
  		    var cipherTextLength = encrypted.length - tagLength;
  		    var cipherText = encrypted.subarray(0, cipherTextLength);
  		    var tag = encrypted.subarray(cipherTextLength);
  		    // ecies payload format: pk || nonce || tag || cipherText
  		    return (0, utils_1.concatBytes)(nonce, tag, cipherText);
  		}
  		function _decrypt(func, key, data, nonceLength, tagLength, AAD) {
  		    var nonce = data.subarray(0, nonceLength);
  		    var cipher = func(key, Uint8Array.from(nonce), AAD); // to reset byteOffset
  		    var encrypted = data.subarray(nonceLength);
  		    if (tagLength === 0) {
  		        return cipher.decrypt(encrypted);
  		    }
  		    var tag = encrypted.subarray(0, tagLength);
  		    var cipherText = encrypted.subarray(tagLength);
  		    return cipher.decrypt((0, utils_1.concatBytes)(cipherText, tag));
  		} 
  	} (symmetric));
  	return symmetric;
  }

  var hasRequiredUtils;

  function requireUtils () {
  	if (hasRequiredUtils) return utils$2;
  	hasRequiredUtils = 1;
  	(function (exports) {
  		var __createBinding = (utils$2 && utils$2.__createBinding) || (Object.create ? (function(o, m, k, k2) {
  		    if (k2 === undefined) k2 = k;
  		    var desc = Object.getOwnPropertyDescriptor(m, k);
  		    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
  		      desc = { enumerable: true, get: function() { return m[k]; } };
  		    }
  		    Object.defineProperty(o, k2, desc);
  		}) : (function(o, m, k, k2) {
  		    if (k2 === undefined) k2 = k;
  		    o[k2] = m[k];
  		}));
  		var __exportStar = (utils$2 && utils$2.__exportStar) || function(m, exports) {
  		    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
  		};
  		Object.defineProperty(exports, "__esModule", { value: true });
  		__exportStar(requireElliptic(), exports);
  		__exportStar(requireHash(), exports);
  		__exportStar(requireHex(), exports);
  		__exportStar(requireSymmetric(), exports); 
  	} (utils$2));
  	return utils$2;
  }

  var PublicKey = {};

  var hasRequiredPublicKey;

  function requirePublicKey () {
  	if (hasRequiredPublicKey) return PublicKey;
  	hasRequiredPublicKey = 1;
  	Object.defineProperty(PublicKey, "__esModule", { value: true });
  	PublicKey.PublicKey = void 0;
  	var utils_1 = /*@__PURE__*/ requireUtils$3();
  	var utils_2 = requireUtils();
  	var PublicKey$1 = /** @class */ (function () {
  	    function PublicKey(data, curve) {
  	        // data can be either compressed or uncompressed if secp256k1
  	        var compressed = (0, utils_2.convertPublicKeyFormat)(data, true, curve);
  	        var uncompressed = (0, utils_2.convertPublicKeyFormat)(data, false, curve);
  	        this.data = compressed;
  	        this.dataUncompressed =
  	            compressed.length !== uncompressed.length ? uncompressed : null;
  	    }
  	    PublicKey.fromHex = function (hex, curve) {
  	        return new PublicKey((0, utils_2.hexToPublicKey)(hex, curve), curve);
  	    };
  	    Object.defineProperty(PublicKey.prototype, "_uncompressed", {
  	        get: function () {
  	            return this.dataUncompressed !== null ? this.dataUncompressed : this.data;
  	        },
  	        enumerable: false,
  	        configurable: true
  	    });
  	    Object.defineProperty(PublicKey.prototype, "uncompressed", {
  	        /** @deprecated - use `PublicKey.toBytes(false)` instead. You may also need `Buffer.from`. */
  	        get: function () {
  	            return Buffer.from(this._uncompressed); // TODO: delete
  	        },
  	        enumerable: false,
  	        configurable: true
  	    });
  	    Object.defineProperty(PublicKey.prototype, "compressed", {
  	        /** @deprecated - use `PublicKey.toBytes()` instead. You may also need `Buffer.from`. */
  	        get: function () {
  	            return Buffer.from(this.data); // TODO: delete
  	        },
  	        enumerable: false,
  	        configurable: true
  	    });
  	    PublicKey.prototype.toBytes = function (compressed) {
  	        if (compressed === void 0) { compressed = true; }
  	        return compressed ? this.data : this._uncompressed;
  	    };
  	    PublicKey.prototype.toHex = function (compressed) {
  	        if (compressed === void 0) { compressed = true; }
  	        return (0, utils_1.bytesToHex)(this.toBytes(compressed));
  	    };
  	    /**
  	     * Derives a shared secret from receiver's private key (sk) and ephemeral public key (this).
  	     * Opposite of `encapsulate`.
  	     * @see PrivateKey.encapsulate
  	     *
  	     * @param sk - Receiver's private key.
  	     * @param compressed - (default: `false`) Whether to use compressed or uncompressed public keys in the key derivation (secp256k1 only).
  	     * @returns Shared secret, derived with HKDF-SHA256.
  	     */
  	    PublicKey.prototype.decapsulate = function (sk, compressed) {
  	        if (compressed === void 0) { compressed = false; }
  	        var senderPoint = this.toBytes(compressed);
  	        var sharedPoint = sk.multiply(this, compressed);
  	        return (0, utils_2.getSharedKey)(senderPoint, sharedPoint);
  	    };
  	    PublicKey.prototype.equals = function (other) {
  	        return (0, utils_1.equalBytes)(this.data, other.data);
  	    };
  	    return PublicKey;
  	}());
  	PublicKey.PublicKey = PublicKey$1;
  	return PublicKey;
  }

  var hasRequiredPrivateKey;

  function requirePrivateKey () {
  	if (hasRequiredPrivateKey) return PrivateKey;
  	hasRequiredPrivateKey = 1;
  	Object.defineProperty(PrivateKey, "__esModule", { value: true });
  	PrivateKey.PrivateKey = void 0;
  	var utils_1 = /*@__PURE__*/ requireUtils$3();
  	var utils_2 = requireUtils();
  	var PublicKey_1 = requirePublicKey();
  	var PrivateKey$1 = /** @class */ (function () {
  	    function PrivateKey(secret, curve) {
  	        this.curve = curve;
  	        if (secret === undefined) {
  	            this.data = (0, utils_2.getValidSecret)(curve);
  	        }
  	        else if ((0, utils_2.isValidPrivateKey)(secret, curve)) {
  	            this.data = secret;
  	        }
  	        else {
  	            throw new Error("Invalid private key");
  	        }
  	        this.publicKey = new PublicKey_1.PublicKey((0, utils_2.getPublicKey)(this.data, curve), curve);
  	    }
  	    PrivateKey.fromHex = function (hex, curve) {
  	        return new PrivateKey((0, utils_2.decodeHex)(hex), curve);
  	    };
  	    Object.defineProperty(PrivateKey.prototype, "secret", {
  	        /** @description From version 0.5.0, `Uint8Array` will be returned instead of `Buffer`. */
  	        get: function () {
  	            // TODO: Uint8Array
  	            return Buffer.from(this.data);
  	        },
  	        enumerable: false,
  	        configurable: true
  	    });
  	    PrivateKey.prototype.toHex = function () {
  	        return (0, utils_1.bytesToHex)(this.data);
  	    };
  	    /**
  	     * Derives a shared secret from ephemeral private key (this) and receiver's public key (pk).
  	     * @description The shared key is 32 bytes, derived with `HKDF-SHA256(senderPoint || sharedPoint)`. See implementation for details.
  	     *
  	     * There are some variations in different ECIES implementations:
  	     * which key derivation function to use, compressed or uncompressed `senderPoint`/`sharedPoint`, whether to include `senderPoint`, etc.
  	     *
  	     * Because the entropy of `senderPoint`, `sharedPoint` is enough high[1], we don't need salt to derive keys.
  	     *
  	     * [1]: Two reasons: the public keys are "random" bytes (albeit secp256k1 public keys are **not uniformly** random), and ephemeral keys are generated in every encryption.
  	     *
  	     * @param pk - Receiver's public key.
  	     * @param compressed - (default: `false`) Whether to use compressed or uncompressed public keys in the key derivation (secp256k1 only).
  	     * @returns Shared secret, derived with HKDF-SHA256.
  	     */
  	    PrivateKey.prototype.encapsulate = function (pk, compressed) {
  	        if (compressed === void 0) { compressed = false; }
  	        var senderPoint = this.publicKey.toBytes(compressed);
  	        var sharedPoint = this.multiply(pk, compressed);
  	        return (0, utils_2.getSharedKey)(senderPoint, sharedPoint);
  	    };
  	    PrivateKey.prototype.multiply = function (pk, compressed) {
  	        if (compressed === void 0) { compressed = false; }
  	        return (0, utils_2.getSharedPoint)(this.data, pk.toBytes(true), compressed, this.curve);
  	    };
  	    PrivateKey.prototype.equals = function (other) {
  	        return (0, utils_1.equalBytes)(this.data, other.data);
  	    };
  	    return PrivateKey;
  	}());
  	PrivateKey.PrivateKey = PrivateKey$1;
  	return PrivateKey;
  }

  var hasRequiredKeys;

  function requireKeys () {
  	if (hasRequiredKeys) return keys;
  	hasRequiredKeys = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.PublicKey = exports.PrivateKey = void 0;
  		// treat Buffer as Uint8array, i.e. no call of Buffer specific functions
  		// finally Uint8Array only
  		var PrivateKey_1 = requirePrivateKey();
  		Object.defineProperty(exports, "PrivateKey", { enumerable: true, get: function () { return PrivateKey_1.PrivateKey; } });
  		var PublicKey_1 = requirePublicKey();
  		Object.defineProperty(exports, "PublicKey", { enumerable: true, get: function () { return PublicKey_1.PublicKey; } }); 
  	} (keys));
  	return keys;
  }

  var hasRequiredDist;

  function requireDist () {
  	if (hasRequiredDist) return dist;
  	hasRequiredDist = 1;
  	(function (exports) {
  		Object.defineProperty(exports, "__esModule", { value: true });
  		exports.utils = exports.PublicKey = exports.PrivateKey = exports.ECIES_CONFIG = void 0;
  		exports.encrypt = encrypt;
  		exports.decrypt = decrypt;
  		var utils_1 = /*@__PURE__*/ requireUtils$3();
  		var config_1 = requireConfig();
  		var keys_1 = requireKeys();
  		var utils_2 = requireUtils();
  		/**
  		 * Encrypts data with a receiver's public key.
  		 * @description From version 0.5.0, `Uint8Array` will be returned instead of `Buffer`.
  		 * To keep the same behavior, use `Buffer.from(encrypt(...))`.
  		 *
  		 * @param receiverRawPK - Raw public key of the receiver, either as a hex `string` or a `Uint8Array`.
  		 * @param data - Data to encrypt.
  		 * @returns Encrypted payload, format: `public key || encrypted`.
  		 */
  		function encrypt(receiverRawPK, data) {
  		    return Buffer.from(_encrypt(receiverRawPK, data));
  		}
  		function _encrypt(receiverRawPK, data) {
  		    var curve = (0, config_1.ellipticCurve)();
  		    var ephemeralSK = new keys_1.PrivateKey(undefined, curve);
  		    var receiverPK = receiverRawPK instanceof Uint8Array
  		        ? new keys_1.PublicKey(receiverRawPK, curve)
  		        : keys_1.PublicKey.fromHex(receiverRawPK, curve);
  		    var sharedKey = ephemeralSK.encapsulate(receiverPK, (0, config_1.isHkdfKeyCompressed)());
  		    var ephemeralPK = ephemeralSK.publicKey.toBytes((0, config_1.isEphemeralKeyCompressed)());
  		    var encrypted = (0, utils_2.symEncrypt)(sharedKey, data);
  		    return (0, utils_1.concatBytes)(ephemeralPK, encrypted);
  		}
  		/**
  		 * Decrypts data with a receiver's private key.
  		 * @description From version 0.5.0, `Uint8Array` will be returned instead of `Buffer`.
  		 * To keep the same behavior, use `Buffer.from(decrypt(...))`.
  		 *
  		 * @param receiverRawSK - Raw private key of the receiver, either as a hex `string` or a `Uint8Array`.
  		 * @param data - Data to decrypt.
  		 * @returns Decrypted plain text.
  		 */
  		function decrypt(receiverRawSK, data) {
  		    return Buffer.from(_decrypt(receiverRawSK, data));
  		}
  		function _decrypt(receiverRawSK, data) {
  		    var curve = (0, config_1.ellipticCurve)();
  		    var receiverSK = receiverRawSK instanceof Uint8Array
  		        ? new keys_1.PrivateKey(receiverRawSK, curve)
  		        : keys_1.PrivateKey.fromHex(receiverRawSK, curve);
  		    var keySize = (0, config_1.ephemeralKeySize)();
  		    var ephemeralPK = new keys_1.PublicKey(data.subarray(0, keySize), curve);
  		    var encrypted = data.subarray(keySize);
  		    var sharedKey = ephemeralPK.decapsulate(receiverSK, (0, config_1.isHkdfKeyCompressed)());
  		    return (0, utils_2.symDecrypt)(sharedKey, encrypted);
  		}
  		var config_2 = requireConfig();
  		Object.defineProperty(exports, "ECIES_CONFIG", { enumerable: true, get: function () { return config_2.ECIES_CONFIG; } });
  		var keys_2 = requireKeys();
  		Object.defineProperty(exports, "PrivateKey", { enumerable: true, get: function () { return keys_2.PrivateKey; } });
  		Object.defineProperty(exports, "PublicKey", { enumerable: true, get: function () { return keys_2.PublicKey; } });
  		/** @deprecated - use `import utils from "eciesjs/utils"` instead. */
  		exports.utils = {
  		    // TODO: remove these after 0.5.0
  		    aesEncrypt: utils_2.aesEncrypt,
  		    aesDecrypt: utils_2.aesDecrypt,
  		    symEncrypt: utils_2.symEncrypt,
  		    symDecrypt: utils_2.symDecrypt,
  		    decodeHex: utils_2.decodeHex,
  		    getValidSecret: utils_2.getValidSecret,
  		    remove0x: utils_2.remove0x,
  		}; 
  	} (dist));
  	return dist;
  }

  var distExports = requireDist();

  window.encryptWithPubKey = function (pubKeyHex, msg) {
    const pubKeyBuffer = Buffer.from(pubKeyHex, 'hex');
    const msgBuffer = Buffer.from(msg);
    const encrypted = distExports.encrypt(pubKeyBuffer, msgBuffer);
    return encrypted.toString('hex');
  };

  window.decryptWithPrivKey = function (privKeyHex, encryptedHex) {
    const privKeyBuffer = Buffer.from(privKeyHex, 'hex');
    const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
    const decrypted = distExports.decrypt(privKeyBuffer, encryptedBuffer);
    return decrypted.toString();
  };

})();
