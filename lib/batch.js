module.exports = function (batchSize, flushAction) {
  var items = []
    , face = {}

  face.flush = function (cb) {
    if (!items.length) { return cb() }

    flushAction(getBatch(), cb)
  }

  face.push = function (item) {
    items.push(item)
  }

  face.getSize = function () {
    return items.length
  }

  function getBatch() {
    var k = 0
      , batch = []

    while (k < batchSize && items.length > 0) {
      batch.push(items.shift())
      k++
    }

    return batch
  }

  return face
}
