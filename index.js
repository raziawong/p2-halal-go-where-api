const express = require('express');
const cors = require('cors');
const { ObjectId } = require('mongodb');
const { connect, getDB } = require('./MongoUtil');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const port_num = process.env.PORT || 3388;

const DB_REL = {
    name: 'muslim_go_where',
    countries: 'countries',
    categories: 'categories',
    articles: 'articles'
};

async function main() {
    await connect(process.env.MONGO_URI, DB_REL.name);

    function sendSuccess(res, data) {
        res.status(200);
        res.json({ data, count: data.length });
    }

    function sendInvalidError(res, details) {
        res.status(406);
        res.json({ 
            main: "Not Acceptable. Request has failed validation.",
            details
        });
    }

    function sendServerError(res, details) {
        res.status(500);
        res.json({
            main: 'Internal Server Error. Please contact administrator.',
            details
        });
    }

    app.get('/countries', async(req, res) => {
        try {
            let criteria = {};
            if (req.query.code) {
                criteria.code = {
                    '$regex': req.query.code,
                    '$options': 'i',
                };
            }
            if (req.query.name) {
                criteria.name = {
                    '$regex': req.query.name,
                    '$options': 'i',
                };
            }

            let countries = await getDB().collection(DB_REL.countries).find(criteria, {
                'projection': {
                    'code': 1,
                    'name': 1
                }
            }).toArray();

            sendSuccess(res, countries);
        } catch (err) {
            sendServerError(res, "Error encountered while reading countries collection.");
        }
    });

    app.get('/countries/cities', async(req, res) => {
        try {
            let criteria = {};
            if (req.query.code) {
                criteria.code = {
                    '$regex': req.query.code,
                    '$options': 'i',
                };
            }
            if (req.query.name) {
                criteria.name = {
                    '$regex': req.query.name,
                    '$options': 'i',
                };
            }
            if (req.query.city) {
                criteria.cities = {
                    '$elemMatch': {
                        'name': {
                            '$regex': req.query.city,
                            '$options': 'i',
                        }
                    }
                }
            }

            let countries = await getDB().collection(DB_REL.countries).find(criteria, {
                'projection': {
                    'code': 1,
                    'name': 1,
                    'cities': 1
                }
            }).toArray();

            sendSuccess(res, countries);
        } catch (err) {
            sendServerError(res, "Error encountered while reading countries collection.");
        }
    });
        } catch (err) {
            res.status(500);
            res.json({
                message: 'Internal Server Error. Please contact administrator.'
            });
        }
    });

    app.get('types', (req, res) => {

    });

    app.get('types/sub', (req, res) => {

    });
}

main();

app.listen(PORT_NUM, function() {
    console.log('Server has started');
});