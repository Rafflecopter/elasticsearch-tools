#!/usr/bin/env node

var program = require('commander')
  , elasticsearch = require('elasticsearch')


// spec
program
  .option('-u, --host [url]', 'elasticsearch url to connect to [http://localhost:9200]', 'http://localhost:9200')

// elasticsearch optional search parameters
var requestParams = 
[
  'analyzer [string]'
, 'analyzeWildcard'
, 'defaultOperator [AND|OR]'
, 'defaultField [string]'
, 'explain'
, 'fields [list]'
, 'from [number]'
, 'ignoreUnavailable'
, 'allowNoIndices'
, 'expandWildcards [open|closed]'
, 'indicesBoost [string]'
, 'lenient'
, 'lowercaseExpandedTerms'
, 'preference [string]'
, 'q [string]'
, 'routing [string]'
, 'scroll [string]'
, 'searchType [query_then_fetch|query_and_fetch|dfs_query_then_fetch|dfs_query_and_fetch|count|scan]'
, 'size [number]'
, 'sort [string]'
, 'source [string]'
, '_source [string]'
, '_sourceExclude [string]'
, '_sourceInclude [string]'
, 'stats [string]'
, 'suggestField [string]'
, 'suggestMode [missing|popular|always]'
, 'suggestText [string]'
, 'timeout [number]'
, 'trackScores'
, 'version'
, 'index [list]'
, 'type [list]'
]

requestParams.forEach(function (option) {
  program.option('--' + option, 'ES OPTION')
})

program.parse(process.argv)

var client = new elasticsearch.Client({host: program.host})
// base for Elasticsearch search request
var baseRequest = requestParams
  .map(function (p) { return p.split(' ')[0] })
  .reduce(function (acc, p) { 
    return program.hasOwnProperty(p)
      ? (acc[p] = program[p]) && acc
      : acc
  }, {})


client.search(baseRequest, function getem(err, resp) {
  if (err) { throw new Error(err) }

  if (!resp.hits.hits) { process.exit(0) }

  resp.hits.hits.forEach(function (hit) {
    process.stdout.write(JSON.stringify(hit) + '\n')
  })

  if (resp._scroll_id) {
    client.scroll({ scrollId: resp._scroll_id, scroll: program.scroll}, getem)
  }
})


// exit when pipe closes (e.g. user pipes into `head -n 5`)
process.stdout.on('error', function( err ) {
  if (err.code == "EPIPE") {
    process.exit(0);
  }
})
