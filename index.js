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

    async function createArticlesIndex() {
        await getDB().collection(DB_REL.articles)
            .createIndex({ title: "text", description: "text", "details.content": "text" }, { name: "ArticlesSearchIndex" });
    }

    async function getCountries({ id, code, name, city }, showCity = false) {
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
            let elMatch = {};

            if (ObjectId.isValid(city)) {
                elMatch = {
                    $elemMatch: {
                        "_id": { $eq: ObjectId(city) }
                    }
                }
            } else {
                elMatch = {
                    $elemMatch: {
                        name: {
                            $regex: city,
                            $options: "i"
                        }
                    }
                }
            }

            criteria.cities = elMatch;

            if (showCity) {
                projection.projection.cities = elMatch;
            }
        }

        let countries = await getDB()
            .collection(DB_REL.countries)
            .find(criteria, projection).toArray();

        return countries;
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
            let elMatch = {};

            if (ObjectId.isValid(subcat)) {
                elMatch = {
                    $elemMatch: {
                        "_id": { $eq: ObjectId(subcat) }
                    }
                }
            } else {
                elMatch = {
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
                            }
                        ]
                    }
                };
            }

            criteria.subcats = elMatch;

            if (showSub) {
                projection.projection.subcats = elMatch;
            }
        }

        let categories = await getDB()
            .collection(DB_REL.categories)
            .find(criteria, projection).toArray();

        return categories;
    }

    async function getArticles({ text, countryId, cityId, catIds, subcatIds }) {
        let criteria = {};
        let projection = {
            projection: {
                title: 1,
                description: 1,
                photos: 1,
                tags: 1,
                location: 1,
                categories: 1,
                createdDate: 1,
                lastModified: 1
            }
        };

        if (text) {
            criteria.$text = { $search: text };
        }
        if (countryId) {
            criteria.location = { countryId };
        }
        if (cityId) {
            criteria.location = { cityId };
        }
        if (catIds) {
            catIds = catIds.split(',');
            criteria.categories = {
                $elemMatch: {
                    catId: { $in: catIds }
                }
            }
        }
        if (subcatIds) {
            subcatIds = subcatIds.split(',');
            criteria.categories = {
                $elemMatch: {
                    subcatIds: { $in: subcatIds }
                }
            }
        }

        let articles = await getDB()
            .collection(DB_REL.articles)
            .find(criteria, projection).toArray();

        return articles;
    }

    async function getArticleContributors(id, email) {
        let criteria = {};
        let projection = {
            projection: {
                title: 1,
                "contributors.displayName": 1,
                createdDate: 1,
                lastModified: 1
            }
        };

        if (id) {
            criteria._id = ObjectId(id);
        }
        if (email) {
            criteria.contributors = {
                $elemMatch: { email }
            }
        }

        let article = await getDB()
            .collection(DB_REL.articles)
            .find(criteria, projection).toArray();

        return article;
    }

    async function deleteDocument(_id, collection) {
        return await getDB().collection(collection).deleteOne({
            _id: ObjectId(_id)
        });
    }

    async function validateCountry({ id, code, name, cities }, isNew = true) {
        let validation = [];

        if (isNew) {
            let countriesQ = await getCountries({ code });
            if (!code) {
                validation.push({ field: "code", error: "Country Code is required" });
            } else if (code.length > 2) {
                validation.push({
                    field: "code",
                    value: code,
                    error: "Country Code must use ISO 3166-1 alpha-2",
                });
            } else if (countriesQ) {
                validation.push({
                    field: "code",
                    value: code,
                    error: "Country Code must be unique and it already exists, please do update on " + countries[0]._id + " in Countries collection instead",
                });
            }
            if (!cities) {
                validation.push({
                    field: "cities",
                    error: "Country needs to have at least one city",
                });
            }
        } else {
            if (!id) {
                validation.push({
                    field: "_id",
                    value: id,
                    error: "Category ID is required for update",
                });
            } else {
                let countriesQ = await getCountries({ id });
                if (!countriesQ) {
                    validation.push({
                        field: "_id",
                        value: id,
                        error: "Country does not exists, please add to Countries collection instead",
                    });
                }
            }
        }
        if (name && !REGEX.displayName.test(name)) {
            validation.push({
                field: "name",
                value: name,
                error: "Country Name cannot contain special characters",
            });
        }

        validation = [...validation, ...await validateCities({ countryCode: code, cities })];
        return validation;
    }

    async function validateCities({ countryCode, cities }) {
        let validation = [];

        if (cities) {
            cities.map(async(c) => {
                if (!REGEX.displayName.test(c.name)) {
                    validation.push({
                        field: "cities.name",
                        value: c.name,
                        error: "City Name cannot contain special characters",
                    });
                }
                if (countryCode) {
                    let countryQ = await getCountries({ countryCode, city: c.name });
                    if (countryQ) {
                        validation.push({
                            field: "cities.name",
                            value: c.name,
                            error: "City Name already exists in Country " + countryCode,
                        });
                    }
                }
                return c;
            });
        }

        return validation;
    }

    async function validateCategory({ id, value, name, subcats }, isNew = true) {
        let validation = [];

        if (isNew) {
            if (!value) {
                validation.push({ field: "value", error: "Category Value is required" });
            } else {
                let categoriesQ = await getCategories({ value });
                if (categoriesQ) {
                    validation.push({
                        field: "value",
                        error: "Category Value already exists, please do update instead",
                    });
                }
            }
            if (!name) {
                validation.push({ field: "name", error: "Category Name is required" });
            }
        } else {
            if (!id) {
                validation.push({
                    field: "_id",
                    value: id,
                    error: "Category ID is required for update",
                });
            } else {
                let categoriesQ = await getCategories({ id });
                if (!categoriesQ) {
                    validation.push({
                        field: "_id",
                        value: id,
                        error: "Category does not exists, please do create instead",
                    });
                }
            }
        }
        if (value && !REGEX.optionValue.test(value)) {
            validation.push({
                field: "value",
                error: "Category Value cannot contain special characters and/or spaces",
            });
        }
        if (name && !REGEX.displayName.test(name)) {
            validation.push({
                field: "name",
                value: name,
                error: "Category Name cannot contain special characters",
            });
        }

        validation = [...validation, ...await validateSubCategories({ categoryValue: value, subcats })];
        return validation;
    }

    async function validateSubCategories({ categoryValue, subcats }) {
        let validation = [];

        if (subcats) {
            subcats.map(async(t) => {
                if (!REGEX.optionValue.test(t.value)) {
                    validation.push({
                        field: "subcats.value",
                        value: t.value,
                        error: "Sub-categories Value cannot contain special characters and/or spaces",
                    });
                }
                if (!REGEX.displayName.test(t.name)) {
                    validation.push({
                        field: "subcats.name",
                        value: t.name,
                        error: "Sub-categories Name cannot contain special characters",
                    });
                }
                if (categoryValue) {
                    let categoryQ = await getCategories({ categoryValue, subcat: t.value });
                    if (categoryQ) {
                        validation.push({
                            field: "subcats.value",
                            value: t.value,
                            error: "Sub-categories Value already exists in Category " + categoryValue,
                        });
                    }
                }
                return t;
            });
        }

        return validation;
    }

    async function validateArticle({ id, title, description, details, photos, tags, contributor, location, categories }, isNew = true) {
        let validation = [];

        if (!title) {
            validation.push({ 
                field: "title", 
                error: "Article Title is required" 
            });
        } else {
            if (title.length > 50) {
                validation.push({ 
                    field: "title", 
                    value: title, 
                    error: "Article Title cannot exceed 50 characters including spaces" 
                });
            }
            if (!REGEX.displayName.test(title)) {
                validation.push({ 
                    field: "title", 
                    value: title, 
                    error: "Article Title cannot contain special characters" 
                });
            }
        }
        if (!description) {
            validation.push({ 
                field: "description", 
                error: "Article Description is required" 
            });
        } else if (description.length > 150) {
            validation.push({ 
                field: "description", 
                value: description, 
                error: "Article Description cannot exceed 150 characters including spaces" });
        }
        if (photos) {
            photos.map(p => {
                if (!REGEX.url.test(p)) {
                    validation.push({ 
                        field: "photos.$", 
                        value: p, 
                        error: "Article Photo URL is not a valid URL" 
                    });
                }
            });
        }
        if (tags) {
            tags.map(t => {
                if (!REGEX.displayName.test(t)) {
                    validation.push({ 
                        field: "tags.$", 
                        value: t, 
                        error: "Article Tag cannot contain special characters" 
                    });
                }
            });
        }
        if (!contributor) {
            validation.push({ 
                field: "contributor", 
                error: "Article Contributor object is required" 
            });
        } else {
            let cName = contributor.name;
            let cEmail = contributor.email;
            if (!cName) {
                validation.push({ 
                    field: "contributor.name", 
                    error: "Article Contributor Name is required" 
                });
            } else if (!REGEX.displayName.test(cName)) {
                validation.push({ 
                    field: "contributor.name", 
                    value: cName, 
                    error: "Article Contributor Name cannot contain special characters" 
                });
            }
            if (!cEmail) {
                validation.push({ 
                    field: "contributor.email", 
                    error: "Article Contributor Email is required" });
            } else if (!REGEX.email.test(cEmail)) {
                validation.push({ 
                    field: "contributor.email",
                     value: cEmail, 
                     error: "Article Contributor Email is not a valid email address" 
                    });
            }
        }
        if (!location) {
            validation.push({ 
                field: "location", 
                error: "Article Location object is required" 
            });
        } else {
            let countryId = location.countryId;
            let cityId = location.cityId;
            let address = location.address;
            if (!countryId) {
                validation.push({ 
                    field: "location.countryId", 
                    error: "Article Location Country ID is required" 
                });
            } else {
                let countryQ = await getCountries({ id: countryId });
                if (!countryQ) {
                    validation.push({ 
                        field: "location.countryId", 
                        value: countryId, 
                        error: "Article Location Country ID is not valid" 
                    });
                } else {
                    if (!cityId) {
                        validation.push({ 
                            field: "location.cityId", 
                            error: "Article Location City ID is required" 
                        });
                    } else {
                        let cityQ = await getCountries({ id: countryId, city: cityId });
                        if (!cityQ) {
                            validation.push({ 
                                field: "location.cityId", 
                                value: cityId, 
                                error: "Article Location City ID is not valid" 
                            });
                        }
                    }
                }
            }
            if (!address) {
                validation.push({ 
                    field: "location.address", 
                    error: "Article Location Address is required" 
                });
            }
        }
        if (!categories) {
            validation.push({ 
                field: "categories", 
                error: "Article Categories object is required" 
            });
        } else {
            categories.map(async(c) => {
                let catId = c.catId;
                if (!catId) {
                    validation.push({ 
                        field: "categories.catId", 
                        error: "Article Category ID is required" 
                    });
                } else {
                    let categoryQ = await getCountries({ id: catId });
                    if (ObjectId.isValid(catId) || !categoryQ) {
                        validation.push({ 
                            field: "categories.catId", 
                            value: catId, 
                            error: "Article Category ID is not valid" 
                        });
                    } else {
                        c["subcatIds"].map(async(subcat) => {
                            let subCatQ = await getCountries({ id: catId, subcat });
                            if (ObjectId.isValid(s) || !subCatQ) {
                                validation.push({ 
                                    field: "location.subcatIds", 
                                    value: subcat, 
                                    error: "Article Sub-category ID is not valid" 
                                });
                            }
                        });
                    }
                }
            })
        }
        if (details) {
            details.map(d => {
                if (!d["section_name"]) {
                    validation.push({ field: 
                        "details.section_name", 
                        error: "Each Article Section requires a heading name" 
                    });
                } else {
                    if (!REGEX.displayName.test(d["section_name"])) {
                        validation.push({ 
                            field: "details.section_name", 
                            value: d["section_name"], 
                            error: "Article Section Name cannot contain special characters" 
                        });
                    }
                    if (!d.content) {
                        validation.push({ 
                            field: "details.content", 
                            error: "Each Article Section requires a content" 
                        });
                    }
                }
                return d;
            })
        }

        return validation;
    }

    app.get("/countries", async function(req, res) {
        try {
            let countries = await getCountries(req.query);
            sendSuccess(res, countries);
        } catch (err) {
            sendServerError(res, "Error encountered while reading countries collection.");
        }
    });

    app.get("/countries/cities", async function(req, res) {
        try {
            let countries = await getCountries(req.query, true);
            sendSuccess(res, countries);
        } catch (err) {
            sendServerError(res, "Error encountered while reading countries collection.");
        }
    });

    app.post("/country", async function(req, res) {
        try {
            let validation = await validateCountry(req.body, true);

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
            sendServerError(res, "Error encountered while adding to countries collection.");
        }
    });

    app.put("/country", async function(req, res) {
        let { id } = req.query;

        if (ObjectId.isValid(id)) {
            try {
                let validation = await validateCountry({ id, ...req.body }, false);

                if (!validation.length) {
                    let { name, cities } = req.body;
                    let update = { $set: {} };
                    if (name) {
                        update.$set.name = name;
                    }
                    if (cities) {
                        let countryQ = await getCountries({ id }, true);
                        cities = [...countryQ.cities, ...cities];
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
                sendServerError(res, "Error encountered while updating" + id + " in countries collection.");
            }
        } else {
            sendInvalidError(res, [{field: "_id", value: id, error: "ID is not a valid ObjectId"}]);
        }
    });

    app.delete("/country", async function(req, res) {
        let { id } = req.query;

        if (ObjectId.isValid(id)) {
            try {
                let doc = await deleteDocument(id, DB_REL.countries);
                console.log(id);
                sendSuccess(res, doc);
            } catch (err) {
                sendServerError(res, "Error encountered while deleting " + id + " in countries collection.");
            }
        } else {
            sendInvalidError(res, [{field: "_id", value: id, error: "ID is not a valid ObjectId"}]);
        }
    });

    app.get("/categories", async function(req, res) {
        try {
            let categories = await getCategories(req.query);
            sendSuccess(res, categories);
        } catch (err) {
            sendServerError(res, "Error encountered while reading categories collection.");
        }
    });

    app.get("/categories/subcats", async function(req, res) {
        try {
            let categories = await getCategories(req.query, true);
            sendSuccess(res, categories);
        } catch (err) {
            sendServerError(res, "Error encountered while reading categories collection.");
        }
    });

    app.post("/category", async function(req, res) {
        try {
            let validation = await validateCategory(req.body, true);

            if (!validation.length) {
                let { value, name, subcats } = req.body;
                let category = await getDB()
                    .collection(DB_REL.categories)
                    .insertOne({ value, name, subcats });
                sendSuccess(res, category);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(res, "Error encountered while adding to categories collection.");
        }
    });

    app.put("/category", async function(req, res) {
        let { id } = req.query;

        if (ObjectId.isValid(id)) {
            try {
                let validation = await validateCategory({ id, ...req.body }, false);

                if (!validation.length) {
                    let { name, subcats } = req.body;
                    let update = { $set: {} };
                    if (name) {
                        update.$set.name = name;
                    }
                    if (subcats) {
                        let categoryQ = await getCategories({ id }, true);
                        subcats = [...categoryQ.subcats, ...subcats];
                        subcats = subcats.map(s => {
                            if (!s._id) {
                                s._id = new ObjectId();
                            }
                            return s;
                        });
                        update.$set.subcats = subcats;
                    }
                    let category = await getDB()
                        .collection(DB_REL.categories)
                        .updateOne({ '_id': ObjectId(id) }, update);
                    sendSuccess(res, category);
                } else {
                    sendInvalidError(res, validation);
                }
            } catch (err) {
                sendServerError(res, "Error encountered while updating " + id + " in categories collection.");
            }
        } else {
            sendInvalidError(res, [{field: "_id", value: id, error: "ID is not a valid ObjectId"}]);
        }
    });

    app.delete("/category", async function(req, res) {
        let { id } = req.query;

        if (ObjectId.isValid(id)) {
            try {
                let doc = await deleteDocument(id, DB_REL.categories);
                sendSuccess(res, doc);
            } catch (err) {
                sendServerError(res, "Error encountered while deleting " + id + " in categories collection.");
            }
        } else {
            sendInvalidError(res, [{field: "_id", value: id, error: "ID is not a valid ObjectId"}]);
        }
    });

    app.get("/articles", async function(req, res) {
        try {
            let articles = await getArticles(req.query);
            sendSuccess(res, articles);
        } catch (err) {
            sendServerError(res, "Error encountered while reading articles collection.");
        }
    });

    app.get("/article/contributors", async function(req, res) {
        let { email, id } = req.query;

        if (ObjectId.isValid(id)) {
            try {
                let article = await getArticleContributors(id, email);
                sendSuccess(res, article);
            } catch (err) {
                sendServerError(res, "Error encountered while getting contributors in article " + id);
            }
        } else {
            sendInvalidError(res, [{field: "_id", value: id, error: "ID is not a valid ObjectId"}]);
        }
    });

    app.post("/article", async function(req, res) {
        try {
            let validation = await validateArticle(req.body);

            if (!validation.length) {
                let { title, description, details, photos, tags, location, categories, allowPublic, contributor } = req.body;
                contributor.displayName = contributor.displayName || contributor.name;
                contributor.isAuthor = true;
                contributor.isLastMod = true;

                let insert = {
                    title,
                    description,
                    details: details || [],
                    photos: photos || [],
                    tags: tags || [],
                    allowPublic: allowPublic || false,
                    location,
                    categories,
                    createdDate: new Date(),
                    lastModified: new Date(),
                    contributor,
                    rating: { avg: 0, count: 0 },
                    comments: [],
                    toDelete: false,
                    isLock: false
                };

                let article = await getDB()
                    .collection(DB_REL.articles)
                    .insertOne(insert);
                sendSuccess(res, article);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(res, "Error encountered while adding to articles collection.");
        }
    });

    app.put("/article/rate", async function(req, res) {
        let { id, rating } = req.query;

        if (ObjectId.isValid(id)) {
            try {
                let validation = [];

                if (!rating) {
                    validation.push({
                        field: "avg",
                        error: "Average rating is required",
                    });
                } else if (isNaN(rating)) {
                    validation.push({
                        field: "avg",
                        value: rating,
                        error: "Average rating must be of Number type",
                    });
                } else if (rating < 0 || rating > 5) {
                    validation.push({
                        field: "avg",
                        value: rating,
                        error: "Average rating cannot be less than 0 or more than 5",
                    });
                }

                if (!validation.length) {
                    let update = {
                        $set: { avg: rating },
                        $inc: { count: 1 }
                    };
                    let article = await getDB()
                        .collection(DB_REL.articles)
                        .updateOne({ '_id': ObjectId(id) }, update);
                    sendSuccess(res, article);
                } else {
                    sendInvalidError(res, validation);
                }
            } catch (err) {
                sendServerError(res,"Error encountered while adding to articles collection.");
            }
        } else {
            sendInvalidError(res, [{field: "_id", value: id, error: "ID is not a valid ObjectId"}]);
        }
    });

    app.delete("/article", async function(req, res) {
        let { id } = req.query;

        try {
            let doc = await deleteDocument(id, DB_REL.articles);
            sendSuccess(res, doc);
        } catch (err) {
            sendServerError(res, "Error encountered while deleting " + id + " in articles collection.");
        }
    });
}

main();

app.listen(portNum, function() {
    console.log("Server has started");
});