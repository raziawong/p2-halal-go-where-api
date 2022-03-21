const express = require("express");
const cors = require("cors");
const { ObjectId } = require("mongodb");
const { connect, getDB } = require("./MongoUtil");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const port_num = process.env.PORT || 3388;

const DB_REL = {
    name: "muslim_go_where",
    countries: "countries",
    categories: "categories",
    articles: "articles",
};

const REGEX = {
    display_name: /[A-Za-zÀ-ȕ\s\-]/,
    option_value: /[A-Za-z0-9\-]/
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
            details,
        });
    }

    function sendServerError(res, details) {
        res.status(500);
        res.json({
            main: "Internal Server Error. Please contact administrator.",
            details,
        });
    }

    async function getCountries({ code, name, city}, showCity = false) {
        let criteria = {};
        let projection = {
            projection: {
                code: 1,
                name: 1,
            }
        };

        if (showCity) {
            projection.projection.cities = 1;
        }

        if (code) {
            criteria.code = {
                $regex: code,
                $options: "i",
            };
        }
        if (name) {
            criteria.name = {
                $regex: name,
                $options: "i",
            };
        }
        if (city) {
            criteria.cities = {
                $elemMatch: {
                    name: {
                        $regex: city,
                        $options: "i",
                    }
                }
            };
        }

        let countries = await getDB()
            .collection(DB_REL.countries)
            .find(criteria, projection).toArray();
        return countries;
    }

    async function validateCountries({ code, name, cities }, isNew = true) {
        let validation = [];
        let countries = await getCountries({code, name: null, cities: null});

        if (!code) {
            validation.push({ field: "code", error: "Country Code is required" });
        } else if (code.length > 2) {
            validation.push({
                field: "code",
                value: code,
                error: "Country Code must use ISO 3166-1 alpha-2",
            });
        } else if (isNew && countries.length) {
            validation.push({
                field: "code",
                error: "Country Code already exists, please do update instead",
            });
        } else if (!isNew && !countries.length) {
            validation.push({
                field: "code",
                value: code,
                error: "Country Code does not exists, please do create instead",
            });
        }

        if (!name) {
            validation.push({ field: "name", error: "Country Name is required" });
        } else if (!REGEX.display_name.match(name)) {
            validation.push({
                field: "name",
                value: name,
                error: "Country Name cannot contain special characters",
            });
        }

        if (!cities) {
            validation.push({
                field: "cities",
                error: "Country needs to have at least one city",
            });
        } else {
            cities.map((c) => {
                if (!REGEX.display_name.match(c.name)) {
                    validation.push({
                        field: "cities",
                        value: c.name,
                        error: "City Name cannot contain special characters",
                    });
                }
                return c;
            });
        }

        if (code && cities) {
            cities.map(async (c) => {
                let country = await getCountries(code, undefined, c.name);
                if (country) {
                    validation.push({
                        field: "cities",
                        value: c.name,
                        error: "City Name already exists in Country " + code,
                    });
                }
                return c;
            });
        }

        return validation;
    }

    async function getCategories({ value, name, subtype }, showSub = false) {
        let criteria = {};
        let projection = {
            projection: {
                value: 1,
                name: 1,
            }
        };

        if (showSub) {
            projection.projection.subtypes = 1;
        }

        if (value) {
            criteria.value = {
                $regex: value,
                $options: "i",
            };
        }
        if (name) {
            criteria.name = {
                $regex: name,
                $options: "i",
            };
        }
        if (subtype) {
            criteria.subtypes = {
                $elemMatch: {
                    $or: [{
                            name: {
                                $regex: subtype,
                                $options: "i",
                            }
                        },
                        {
                            value: {
                                $regex: subtype,
                                $options: "i",
                            }
                    }]
                }
            };
        }

        let categories = await getDB()
            .collection(DB_REL.categories)
            .find(criteria, projection).toArray();
        return categories;
    }

    async function validateCategories({ value, name, subtypes }, isNew = true) {
        let validation = [];
        let categories = await getCategories({ value, name: null, subtypes: null });

        if (!value) {
            validation.push({ field: "value", error: "Category Value is required" });
        } else {
            if (!REGEX.option_value.test(value)) {
                validation.push({
                    field: "value",
                    error: "Category Value cannot contain special characters and/or spaces",
                });
            }
            if (isNew && categories.length) {
                validation.push({
                    field: "value",
                    error: "Category Value already exists, please do update instead",
                });
            } else if (!isNew && !categories.length) {
                validation.push({
                    field: "value",
                    value: value,
                    error: "Category Value does not exists, please do create instead",
                });
            }
        }

        if (!name) {
            validation.push({ field: "name", error: "Category Name is required" });
        } else if (!REGEX.display_name.match(name)) {
            validation.push({
                field: "name",
                value: name,
                error: "Category Name cannot contain special characters",
            });
        }

        if (subtypes) {
            subtypes.map(t => {
                if (!REGEX.option_value.match(t.value)) {
                    validation.push({
                        field: "subtypes",
                        value: t.value,
                        error: "Sub-types Value cannot contain special characters and/or spaces",
                    });
                }
                if (!REGEX.display_name.match(t.name)) {
                    validation.push({
                        field: "subtypes",
                        value: t.name,
                        error: "Sub-types Name cannot contain special characters",
                    });
                }
                return t;
            });
        }

        if (value && subtypes) {
            subtypes.map(async (t) => {
                let category = await getCategories({ value, name: null, subtypes: t.value });
                if (category) {
                    validation.push({
                        field: "subtypes",
                        value: t.value,
                        error: "Sub-types Value already exists in Category " + value,
                    });
                }
                return c;
            });
        }

        return validation;        
    }

    app.get("/countries", async(req, res) => {
        try {
            let countries = await getCountries(req.query);
            sendSuccess(res, countries);
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while reading countries collection."
            );
        }
    });

    app.post("/countries", async(req, res) => {
        try {
            let validation = await validateCountries(req.body, true);

            if (!validation.length) {
                let { code, name, cities } = req.body;
                code = code.toUpperCase();
                cities = cities.map((c) => {
                    c._id = new ObjectId();
                    return c;
                });
                let country = await getDB()
                    .collection(DB_REL.countries)
                    .insertOne({ code, name, cities });
                sendSuccess(res, country);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while adding to countries collection."
            );
        }
    });

    app.patch("/countries", async(req, res) => {
        try {
            let validation = await validateCountries(req.body, false);

            if (!validation.length) {
                let { code, name, cities } = req.body;
                let update = {
                    $set: {},
                };
                if (name) {
                    update.$set.name = name;
                }
                if (cities) {
                    cities = cities.map((c) => {
                        if (!c._id) {
                            c._id = new ObjectId();
                        }
                        return c;
                    });
                    update.$set.cities = cities;
                }

                let country = await getDB()
                    .collection(DB_REL.countries)
                    .updateOne({ code: code }, update);
                sendSuccess(res, country);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while adding to countries collection."
            );
        }
    });

    app.get("/countries/cities", async(req, res) => {
        try {
            let countries = await getCountries(req.query, true);
            sendSuccess(res, countries);
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while reading countries collection."
            );
        }
    });    

    app.get("/categories", async(req, res) => {
        try {
            let categories = await getCategories(req.query);
            sendSuccess(res, categories);
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while reading categories collection."
            );
        }
    });

    app.post("/categories", async(req, res) => {
        try {
            let validation = await validateCategories(req.body, true);

            if (!validation.length) {
                let { value, name, subtypes } = req.body;
                let categories = await getDB
                    .collection(DB_REL.categories)
                    .insertOne({ value, name, subtypes });
                sendSuccess(res, categories);
            } else {
                sendInvalidError(res, validation);
            }            
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while adding to categories collection."
            );
        }
    });

    app.patch("/categories", async(req, res) => {
        try {
            let validation = await validateCategories(req.body, false);

            if (!validation.length) {
                let { value, name, subtypes } = req.body;
                let update = {
                    $set: {},
                };
                if (name) {
                    update.$set.name = name;
                }
                if (subtypes) {
                    update.$set.subtypes = subtypes;
                }
                let categories = await getDB
                    .collection(DB_REL.categories)
                    .updateOne({ value }, update);
                sendSuccess(res, categories);
            } else {
                sendInvalidError(res, validation);
            }            
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while adding to categories collection."
            );
        }
    });

    app.get("/categories/sub", async(req, res) => {
        try {
            let categories = await getCategories(req.query, true);
            sendSuccess(res, categories);
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while reading categories collection."
            );
        }
    });
}

main();

app.listen(port_num, function() {
    console.log("Server has started");
});