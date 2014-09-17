#!/usr/bin/env node
var program = require('commander')
  , elasticsearch = require('elasticsearch')
  , split = require('split')

var Batch = require('./batch')


//Spec
program
  .version('v0.0.1', '-v, --version')
  .option('-i, --index <string>', 'index to check if document exists in')
  .option('-u, --host [string', 'the elasticsearch host to connect to', 'http://localhost:9200')
  .option('-b, --batchSize [num]', 'the number of documents to mget', 1000)
  .parse(process.argv)


var client = new elasticsearch.Client({host: program.host})

var stream = process.stdin.pipe(split())

var batch = Batch(program.batchSize, flushAction)


stream
  .on('data', function (line) {
    if (line !== '') { batch.push(line) }
  })

  .on('data', function () {
    if (batch.getSize() >= program.batchSize) {
      stream.pause() && batch.flush(stream.resume.bind(stream))
    }
  })

  .on('end', batch.flush.bind(null, process.exit.bind(process, 0)))

  .on('error', function (err) { throw new Error(err) })


function flushAction(lines, cb) {
  var docs = JSON.parse('[' + lines.join(',') + ']')
  var ids = docs.map(function (doc) {
    return {_id: doc._id, _type: doc._type, _index: program.index}
  })

  client.mget({_source: false, body: {docs: ids}}, function (err, resp) {
    if (err) { throw new Error(err) }

    var unfoundIds = resp.docs.reduce(function (acc, doc) { 
      return !doc.found ? acc.concat(doc._id) : acc
    }, [])

    docs.forEach(function (doc, index) {
      if (!!~unfoundIds.indexOf(doc._id)) {
        process.stdout.write(lines[index] + '\n')
      }
    })

    cb()
  })
}


// exit when pipe closes (e.g. user pipes into `head -n 5`)
process.stdout.on('error', function(err) {
  if (err.code == "EPIPE") {
    process.exit(0);
  }
})
