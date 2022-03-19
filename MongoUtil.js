const MongoClient = require('mongodb').MongoClient;

let _db;

async function connect(uri, dbname) {
    const client = await MongoClient.connect(uri, {
        useUnifiedTopology: true,
        useNewUrlParser: true
    })

    _db = client.db(dbname);
    console.log('Connected to database', dbname);
}

function getDB() {
    return _db;
}

module.exports = { connect, getDB }