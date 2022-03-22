const express = require("express");
const cors = require("cors");
const { ObjectId } = require("mongodb");
const { connect, getDB } = require("./MongoUtil");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());

const portNum = process.env.PORT || 3388;

const DB_REL = {
    name: "muslim_go_where",
    countries: "countries",
    categories: "categories",
    articles: "articles",
};

const REGEX = {
    displayName: new RegExp(/^[A-Za-zÀ-ȕ\s\-]*$/),
    optionValue: new RegExp(/^[A-Za-z0-9\-]*$/),
    email: new RegExp(/^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/),
    url: new RegExp(/^[(http(s)?):\/\/(www\.)?a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/)
};

async function main() {
    await connect(process.env.MONGO_URI, DB_REL.name);
    await createArticlesIndex();

    function sendSuccess(res, data) {
        res.status(200);
        res.json({ data, count: data.length });
    }

    function sendInvalidError(res, details) {
        res.status(406);
        res.json({
            message: "Not Acceptable. Request has failed validation.",
            details
        });
    }

    function sendServerError(res, details) {
        res.status(500);
        res.json({
            message: "Internal Server Error. Please contact administrator.",
            details
        });
    }

    async function getCountries({ id, code, name, city}, showCity = false) {
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

        if (id) {
            criteria._id = ObjectId(id);
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
            let matchCrit = {
                $elemMatch: {
                    name: {
                        $regex: city,
                        $options: "i",
                    }
                }
            };
            criteria.cities = { matchCrit };

            if (showCity) {
                projection.projection.cities = { matchCrit };
            }
        }

        let countries = await getDB()
            .collection(DB_REL.countries)
            .find(criteria, projection).toArray();
        return countries;
    }

    async function validateCountries({ id, code, name, cities }, isNew = true) {
        let validation = [];

        if (isNew) {
            let countries = await getCountries({ code });
            if (!code) {
                validation.push({ field: "code", error: "Country Code is required" });
            } else if (code.length > 2) {
                validation.push({
                    field: "code",
                    value: code,
                    error: "Country Code must use ISO 3166-1 alpha-2",
                });
            } else if (countries.length) {
                validation.push({
                    field: "code",
                    error: "Country Code already exists, please do update instead",
                });
            }
            if (!cities) {
                validation.push({
                    field: "cities",
                    error: "Country needs to have at least one city",
                });
            } 
        } else {
            let countries = await getCountries({ id });
            if (!id) {
                validation.push({
                    field: "_id",
                    value: id,
                    error: "Category ID is required for update",
                });
            } else if (!countries.length) {
                validation.push({
                    field: "_id",
                    value: id,
                    error: "Country does not exists, please do create instead",
                });
            }
        }

        if (name && !REGEX.display_name.test(name)) {
            validation.push({
                field: "name",
                value: name,
                error: "Country Name cannot contain special characters",
            });
        }

        if (cities) {
            cities.map((c) => {
                if (!REGEX.display_name.test(c.name)) {
                    validation.push({
                        field: "cities.name",
                        value: c.name,
                        error: "City Name cannot contain special characters",
                    });
                }
                return c;
            });
        }

        if (code && cities) {
            cities.map(async (c) => {
                let country = await getCountries({ code, city: c.name });
                if (country) {
                    validation.push({
                        field: "cities.name",
                        value: c.name,
                        error: "City Name already exists in Country " + code,
                    });
                }
                return c;
            });
        }
        
        return validation;
    }

    async function getCategories({ id, value, name, subcat }, showSub = false) {
        let criteria = {};
        let projection = {
            projection: {
                value: 1,
                name: 1,
            }
        };

        if (showSub) {
            projection.projection.subcats = 1;
        }

        if (id) {
            criteria._id = ObjectId(id);
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
        if (subcat) {
            criteria.subcats = {
                $elemMatch: {
                    $or: [{
                            name: {
                                $regex: subcat,
                                $options: "i",
                            }
                        },
                        {
                            value: {
                                $regex: subcat,
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

    async function validateCategories({ id, value, name, subcats }, isNew = true) {
        let validation = [];

        if (isNew) {
            let categories = await getCategories({ value });
            if (!value) {
                validation.push({ field: "value", error: "Category Value is required" });
            } else if (categories.length) {
                validation.push({
                    field: "value",
                    error: "Category Value already exists, please do update instead",
                });
            }

            if (!name) {
                validation.push({ field: "name", error: "Category Name is required" });
            } 
        } else {
            let categories = await getCategories({ id });
            if (!id) {
                validation.push({
                    field: "_id",
                    value: id,
                    error: "Category ID is required for update",
                });
            } else if (!categories.length) {
                validation.push({
                    field: "_id",
                    value: id,
                    error: "Category does not exists, please do create instead",
                });
            }
        }

        if (value && !REGEX.option_value.test(value)) {
            validation.push({
                field: "value",
                error: "Category Value cannot contain special characters and/or spaces",
            });
        }
        if (name && !REGEX.display_name.test(name)) {
            validation.push({
                field: "name",
                value: name,
                error: "Category Name cannot contain special characters",
            });
        }
        if (subcats) {
            subcats.map(t => {
                if (!REGEX.option_value.test(t.value)) {
                    validation.push({
                        field: "subcats.value",
                        value: t.value,
                        error: "Sub-categories Value cannot contain special characters and/or spaces",
                    });
                }
                if (!REGEX.display_name.test(t.name)) {
                    validation.push({
                        field: "subcats.name",
                        value: t.name,
                        error: "Sub-categories Name cannot contain special characters",
                    });
                }
                return t;
            });
        }

        if (value && subcats) {
            subcats.map(async (t) => {
                let category = await getCategories({ value, subcat: t.value });
                if (category) {
                    validation.push({
                        field: "subcats.value",
                        value: t.value,
                        error: "Sub-categories Value already exists in Category " + value,
                    });
                }
                return t;
            });
        }
        
        return validation;        
    }

    async function deleteDocument(_id, collection) {
        return await getDB().collection(collection).deleteOne({
            _id: ObjectId(_id)
        });
    }

    app.get("/countries", async function (req, res) {
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

    app.post("/countries", async function (req, res) {
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

    app.patch("/countries", async function (req, res) {
        let { id } = req.query;
        try {
            let validation = await validateCountries({id, ...req.body}, false);

            if (!validation.length) {
                let { code, name, cities } = req.body;
                let update = {
                    $set: {},
                };
                if (code) {
                    update.$set.code = code;
                }
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
                    .updateOne({ '_id': ObjectId(id) }, update);
                sendSuccess(res, country);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while patching"+ id +" in countries collection."
            );
        }
    });

    app.delete("/countries", async function (req, res) {
        let { id } = req.query;

        try {
            let doc = await deleteDocument(id, DB_REL.countries);
            console.log(id);
            sendSuccess(res, doc);
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while deleting "+ id +" in countries collection."
            );
        }
    });

    app.get("/countries/cities", async function (req, res) {
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

    app.get("/categories", async function (req, res) {
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

    app.post("/categories", async function (req, res) {
        try {
            let validation = await validateCategories(req.body, true);

            if (!validation.length) {
                let { value, name, subcats } = req.body;
                let categories = await getDB()
                    .collection(DB_REL.categories)
                    .insertOne({ value, name, subcats });
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

    app.patch("/categories", async function (req, res) {
        let { id } = req.query;
        try {
            let validation = await validateCategories({id, ...req.body}, false);

            if (!validation.length) {
                let { value, name, subcats } = req.body;
                let update = {
                    $set: {},
                };
                if (value) {
                    update.$set.value = value;
                }
                if (name) {
                    update.$set.name = name;
                }
                if (subcats) {
                    update.$set.subcats = subcats;
                }
                let categories = await getDB()
                    .collection(DB_REL.categories)
                    .updateOne({ '_id': ObjectId(id) }, update);
                sendSuccess(res, categories);
            } else {
                sendInvalidError(res, validation);
            }            
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while patching "+ id +" in categories collection."
            );
        }
    });

    app.delete("/categories", async function (req, res) {
        let { id } = req.query;

        try {
            let doc = await deleteDocument(id, DB_REL.categories);
            sendSuccess(res, doc);
        } catch (err) {
            sendServerError(
                res,
                "Error encountered while deleting "+ id +" in categories collection."
            );
        }
    });

    app.get("/categories/sub", async function (req, res) {
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