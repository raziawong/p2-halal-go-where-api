const express = require('express');
const cors = require('cors');
const { ObjectId } = require('mongodb');
const { connect, getDB } = require('./MongoUtil');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT_NUM = process.env.PORT || 3333;

const DB_REL = {
    name: 'muslim_go_where',
    countries: 'countries',
    types: 'categories',
};

async function main() {
    await connect(process.env.MONGO_URI, DB_REL.name);

    app.get('/countries', async (req, res) => {
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
            }}).toArray();

            res.status(200);
            res.json({ data: countries });
        } catch (err) {
            res.status(500);
            res.json({
                message: 'Internal Server Error. Please contact administrator.'
            });
        }
    });

    app.get('/countries/cities', async (req, res) => {
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
            if(req.query.city) {
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
            }}).toArray();

            res.status(200);
            res.json({ data: countries });
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