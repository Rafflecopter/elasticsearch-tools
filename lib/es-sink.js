#!/usr/bin/env node

var program = require('commander')
  , elasticsearch = require('elasticsearch')
  , split = require('split')

// Spec
program
  .version('v0.0.1', '-v, --version')
  .option('-u, --host [string]', 'the elasticsearch host to connect to', 'http://localhost:9200')
  .option('-b, --batchSize [num]', 'the number of operations to send per bulk request', function (n) { return parseInt(n, 10) }, 10000)
  .option('-c, --consistency [one|quorum|all]', 'elasticsearch consistency setting for the bulk request')
  .option('-r, --refresh', 'if present, refresh index after performing each bulk request')
  .option('-s, --replication [sync|async]', 'explicitly set the replication type [sync]')
  .option('-p, --routing [string]', 'specify a routing value')
  .option('-m, --timeout [num]', 'number of milliseconds to timeout after during a bulk request', parseInt)
  .option('-t, --type [string]', 'default document type if not provided')
  .option('-i, --index [string]', 'default elasticsearch index if not provided')
  .parse(process.argv)

var baseRequest = 
  [
    'consistency'
  , 'refresh'
  , 'replication'
  , 'routing'
  , 'timeout'
  , 'type'
  , 'index'
  ].reduce(function (acc, param) {
    return program.hasOwnProperty(param) 
      ? (acc[param] = program[param]) && acc
      : acc
  }, {})

var client = new elasticsearch.Client({host: program.host})

var stream = process.stdin.pipe(split())

var batch = Batch(program.batchSize, flushAction)


stream
  .on('data', batch.add)

  .on('data', function () {
    if (!batch.needsFlush()) { return }
    stream.pause() && batch.flush(stream.resume.bind(stream))
  })

  .on('error', function (err) { throw new Error(err) })

  .on('end', batch.flush.bind(null, process.exit.bind(process, 0)))


function flushAction(lines, cb) {
  baseRequest.body = lines.join('\n')
  client.bulk(baseRequest, function (err, resp) {
    if (err) { throw new Error(err) }

    if (resp.errors) {
      resp.items.filter(function (op) {
        return op.index.status > 299
      }).forEach(function (err) { console.log(JSON.stringify(err)) })
    }

    cb()
  })
}

function Batch(batchSize, flushAction) {
  var lines = []
    , expectSource = false
    , face = {}

  face.flush = function (cb) {
    if (!lines.length) { return cb() }

    var linesSubset = grabABatch()
    flushAction(linesSubset, function (err, resp) {
      if (err) { throw new Error(err) }

      cb()
    })
  }

  face.add = function (line) {
    if (line === '') { return }

    lines.push(line)

    updateMetaState(line)
  }

  face.needsFlush = function () {
    return !expectSource && lines.length >= batchSize
  }

  function grabABatch() {
    var k = 0
      , linesSubset = []

    while (k < batchSize && lines.length > 0) {
      linesSubset.push(lines.shift())
      k++
    }

    return linesSubset
  }

  function updateMetaState(line) {
    if (!expectSource && /"index":|"create":|"update":|"delete":/.test(line)) {
      expectSource = !(/"delete":/.test(line))
    } else {
      expectSource = false
    }
  }

  return face
}
