#!/usr/bin/env node
'use strict';

var helpers = require('./helpers');
var fs = require('fs');
var program = require('commander');
var elasticsearch = require('elasticsearch');
var LineByLineReader = require('line-by-line');
var appInfo = require('../package.json');
var filesize = require('filesize');
var ProgressBar = require('progress');

// setup command line options
program
  .version(appInfo.version, '-v, --version')
  .option('-u, --url <url>', 'the elasticsearch url to connect to')
  .option('-f, --file <file>', 'the file to write data to')
  .option('-m, --max <items>', 'the max number of lines to process per batch', parseInt, 20000)
  .option('-o, --offset <documents>', 'document to start with', parseInt, 0)
  .parse(process.argv);

// validate url and file
helpers.validateUrlAndFile(program);

// validate max items per batch
if (program.max <= 0 || Number.isNaN(program.max)) {
  helpers.exit('You must pass in a valid --max option');
}

// validate file exists
if (!fs.existsSync(program.file)) {
  helpers.exit('The file you passed in does not exist.');
}


// instance variables
var currentCount = 0;
var currentBatch = '';
var bar = new ProgressBar('[:bar] :percent :elapseds', {
  width: 20,
  total: fs.statSync(program.file).size
});
var client = new elasticsearch.Client({host: program.url});

console.log('Importing file of size: ' + filesize(bar.total));
bar.render()

var lr = new LineByLineReader(program.file, { encoding: 'utf8', skipEmptyLines: false });
lr.on('error', helpers.exit);
lr.on('line', progressTick)
lr.on('line', ifOffsetMet(addToBatch))
lr.on('line', ifBatchReady(flush.bind(null, true)))
lr.on('end', flush.bind(null, false, true))



function ifBatchReady(fn) {
  return function () {
    if (currentCount >= program.max && currentCount % 2 === 0) { fn() }
  }
}

function ifOffsetMet(fn) {
  var lineCount = 0

  return function (line) {
    if (lineCount >= 2*program.offset) {
      fn(line)
    }

    lineCount++
  }
}

function flush(shouldPause, isEnding) {
  shouldPause && lr.pause();
  bulkImport(function () {
    shouldPause && lr.resume();

    // reset global variables
    currentCount = 0;
    currentBatch = '';

    if (isEnding) {
      bar.update(1)
      console.log('Complete!')
      process.exit()
    }
  });
}

function addToBatch(line) {
  currentCount++
  currentBatch += line + '\n'
}

function progressTick(line) {
  bar.tick(line.length)
}

// declare our bulk import function
function bulkImport(cb) {
  client.bulk({body: currentBatch}, function (err, response) {
    if (err) {
      helpers.exit(err);
    }

    if (response.error) {
      helpers.exit('When executing bulk query: ' + response.error.toString());
    }

    cb();
  });
};

