#!/usr/bin/env node

var program = require('commander')
  , elasticsearch = require('elasticsearch')
  , split = require('split')

// Spec
program
  .version('v0.0.1', '-v, --version')
  .option('-u, --host <string>', 'the elasticsearch host to connect to', 'http://localhost:9200')
  .option('-b, --batchSize <num>', 'the number of operations to send per bulk request', function (n) { return parseInt(n, 10) }, 10000)
  .option('-c, --consistency <one|quorum|all>', 'elasticsearch consistency setting for the bulk request')
  .option('-r, --refresh', 'if present, refresh index after performing each bulk request')
  .option('-s, --replication <sync|async>', 'explicitly set the replication type')
  .option('-p, --routing <string>', 'specify a routing value')
  .option('-m, --timeout <num>', 'number of milliseconds to timeout after during a bulk request', parseInt)
  .option('-t, --type <string>', 'default document type if not provided')
  .option('-i, --index <string>', 'default elasticsearch index if not provided')
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

var batch = Batch(stream, program.batchSize, flushAction)


stream
  .on('data', batch.add)
  .on('error', function (err) { throw new Error(err) })
  .on('end', batch.flush.bind(null, function() { process.exit() }))


function flushAction(body, cb) {
  client.bulk((baseRequest.body = body) && baseRequest, cb)
}

function Batch(stream, batchSize, flushAction) {
  var body = ''
    , totalOperations = 0
    , expectSource = false
    , face = {}

  face.flush = function (cb) {
    if (!body.length) { return cb() }

    flushAction(body, function (err, resp) {
      if (err) { throw new Error(err) }

      reset()

      cb()
    })
  }

  face.add = function (line) {
    if (line === '') { return }

    body += line + '\n'

    if (!expectSource && /"index":|"create":|"update":|"delete":/.test(line)) {
      expectSource = !(/"delete":/.test(line))
      totalOperations++
    } else {
      expectSource = false
    }

    if (!expectSource && totalOperations >= batchSize) {
      stream.pause()
      face.flush(function () { stream.resume() })
    }
  }

  function reset() {
    body = ''
    totalOperations = 0
    expectSource = false
  }

  return face
}
