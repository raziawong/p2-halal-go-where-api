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

const REGEX = {
    location_name: /[A-Za-zÀ-ȕ\s\-]/
}

async function main() {
    await connect(process.env.MONGO_URI, DB_REL.name);

    function sendSuccess(res, data) {
        res.status(200);
        res.json({ data, count: data.length });
    }

    function sendInvalidError(res, details) {
        res.status(406);
        res.json({ 
            main: 'Not Acceptable. Request has failed validation.',
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

    async function getCountries(code, name, city, showCity=false) {
        let criteria = {};
        let projection = { 
            'projection': {
                'code': 1,
                'name': 1,
            }
        };

        if (showCity) {
            projection.projection.cities = 1;
        }

        if (code) {
            criteria.code = {
                '$regex': code,
                '$options': 'i',
            };
        }
        if (name) {
            criteria.name = {
                '$regex': name,
                '$options': 'i',
            };
        }
        if (city) {
            criteria.cities = {
                '$elemMatch': {
                    'name': {
                        '$regex': city,
                        '$options': 'i',
                    }
                }
            }
        }

        let countries = await getDB()
            .collection(DB_REL.countries)
            .find(criteria, projection).toArray();
        return countries;
    }

    async function validateCountries({ code, name, cities }, isNew=true) {
        let validation = [];
        let countries = await getCountries(code, null);

        if (!code) {
            validation.push({'field': 'code', 'error': 'Country Code is required'});
        } else if (code.length > 2) {
            validation.push({'field': 'code', 'value': code, 'error': 'Country Code must use ISO 3166-1 alpha-2'});
        } else if (isNew && countries.length) {
            validation.push({'field': 'code', 'error': 'Country Code already exists, please do update instead'});
        } else if (!isNew && !countries.length) {
            validation.push({'field': 'code', 'value': code, 'error': 'Country Code does not exists, please do create instead'});
        }

        if (!name) {
            validation.push({'field': 'name', 'error': 'Country Name is required'});
        } else if (!REGEX.location_name.match(name)) {
            validation.push({'field': 'name', 'value': name, 'error': 'Country Name cannot contain special characters'});
        }

        if (!cities) {
            validation.push({'field': 'cities', 'error': 'Country needs to have at least one city'});
        } else {
            cities = cities.map(c => {
                if (!REGEX.location_name.match(c.name)) {
                    validation.push({'field': 'cities', 'value': c.name, 'error': 'City name cannot contain special characters'});
                }
                return c;
            });
        }

        if (code && cities) {
            cities = cities.map(c => {
                let country = await getCountries(code, undefined, c.name);
                if (country) {
                    validation.push({'field': 'cities', 'value': c.name, 'error': 'City name already exists in Country ' + code});
                }
                return c;
            });
        }

        return validation;
    }

    app.get('/countries', async(req, res) => {
        try {
            let { code, name } = req.query;
            let countries = await getCountries(code, name);
            sendSuccess(res, countries);
        } catch (err) {
            sendServerError(res, 'Error encountered while reading countries collection.');
        }
    });

    app.post('/countries', async(req, res) => {
        try {
            let { code, name, cities } = req.body;
            let validation = await validateCountries(req.body, true);
            
            if (!validation.length){
                code = code.toUpperCase();
                cities = cities.map(c => {
                    c._id = new ObjectId();
                    return c;
                })
                let country = await getDB.collection(DB_REL.countries).insertOne({code, name, cities});
                sendSuccess(res, country);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(res, 'Error encountered while adding to countries collection.');
        }
    });

    app.patch('/countries', async(req, res) => {
        try {
            let { code, name, cities } = req.body;
            let validation = await validateCountries(req.body, false);
            
            if (!validation.length){
                let update = {
                    '$set': {}
                };
                if (name) {
                    update.$set.name = name;
                }
                if (cities) {
                    cities = cities.map(c => {
                        if (!c._id) {
                            c._id = new ObjectId();
                        }
                        return c;
                    });
                    update.$set.cities = cities;
                }

                let country = await getDB
                    .collection(DB_REL.countries)
                    .updateOne({ 'code': code }, update);
                sendSuccess(res, country);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(res, 'Error encountered while adding to countries collection.');
        }
    });



    app.get('/categories', async(req, res) => {
        try {
            let criteria = {};
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