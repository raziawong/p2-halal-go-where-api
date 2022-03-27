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
    spaces: new RegExp(/^[\s]*$/),
    displayName: new RegExp(/^[A-Za-zÀ-ȕ\s\-]*$/),
    optionValue: new RegExp(/^[A-Za-z0-9\-]*$/),
    email: new RegExp(/^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/),
    url: new RegExp(/^[(http(s)?):\/\/(www\.)?a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/)
};

const ERROR_TEMPLATE = {
    id: "Id is not a valid ObjectId",
    create: collection => `Error encountered while adding data to ${collection} collection`,
    createEmbed: (collection, document, id) => `Error encountered while adding ${document} data using parent (${id}) to ${collection} collection`,
    read: collection => `Error encountered while retrieving data from ${collection} collection`,
    readEmbed: (collection, document, id) => `Error encountered while retrieving ${document} data using ${id} from ${collection} collection`,
    update: (collection, id) => `Error encountered while updating ${id} in ${collection} collection`,
    updateEmbed: (collection, childId, parentId) => `Error encountered while updating ${childId} data using parent (${parentId}) in ${collection} collection`,
    delete: (collection, id) => `Error encountered while deleting ${id} from ${collection} collection`,
    deleteEmbed: (collection, childId, parentId) => `Error encountered while deleting ${childId} data using parent (${parentId}) in ${collection} collection`,
    required: field => `${field} is required`,
    requiredDoc: (object, field) => `${object} needs to have at least one ${field}`,
    spaces: field => `${field} cannot contain only space( s)`,
    special: field => `${field} cannot contain special characters`,
    specialSpace: field => `${field} cannot contain special characters and/or spaces`,
    length: (field, length) => `${field} cannot exceed ${length} characters including spaces`,
    email: field => `${field} is not a valid email address`,
    url: field => `${field} is not a valid URL`,
    exists: (field, id, collection) => `${field} must be unique and it already exists, please do update on ${id} in ${collection} collection instead`,
    notExist: (object, collection) => `${object} does not exists, please do add to ${collection} collection instead`
}

async function main() {
    await connect(process.env.MONGO_URI, DB_REL.name);
    await createArticlesIndex();

    function sendSuccess(res, results) {
        res.status(200);
        res.json({ results, count: results.length });
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

        await getDB().collection(DB_REL.articles)
            .createIndex({ title: 1, createdDate: 1 }, { name: "ArticlesSortIndex" });
    }

    async function getCountries({ countryId, code, name, city }, showCity = false) {
        let criteria = {};
        let projectOpt = {
            projection: {
                code: 1,
                name: 1,
            }
        };

        if (showCity) {
            projectOpt.projection.cities = 1;
        }
        if (countryId) {
            criteria._id = ObjectId(countryId);
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
                projectOpt.projection.cities = elMatch;
            }
        }

        let countries = await getDB().collection(DB_REL.countries)
            .find(criteria, projectOpt).toArray();

        return countries;
    }

    async function getCategories({ catId, value, name, subcat }, showSub = false) {
        let criteria = {};
        let projectOpt = {
            projection: {
                value: 1,
                name: 1,
            }
        };

        if (showSub) {
            projectOpt.projection.subcats = 1;
        }
        if (catId) {
            criteria._id = ObjectId(catId);
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
                projectOpt.projection.subcats = elMatch;
            }
        }

        let categories = await getDB().collection(DB_REL.categories)
            .find(criteria, projectOpt).toArray();

        return categories;
    }

    async function getArticles({ articleId, text, countryId, cityId, catIds, subcatIds }) {
        let criteria = {};
        let projectOpt = {
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

        if (articleId) {
            criteria._id = ObjectId(articleId);
        }
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
            catIds = catIds.split(",");
            criteria.categories = {
                $elemMatch: {
                    catId: { $in: catIds }
                }
            }
        }
        if (subcatIds) {
            subcatIds = subcatIds.split(",");
            criteria.categories = {
                $elemMatch: {
                    subcatIds: { $in: subcatIds }
                }
            }
        }

        let articles = await getDB().collection(DB_REL.articles)
            .find(criteria, projectOpt).toArray();

        return articles;
    }

    async function getArticleContributors({ articleId, email }) {
        let criteria = {};
        let projectOpt = {
            projection: {
                title: 1,
                "contributors.displayName": 1,
                "contributors.isAuthor": 1,
                "contributors.isLastMod": 1,
                createdDate: 1,
                lastModified: 1
            }
        };

        if (articleId) {
            criteria._id = ObjectId(articleId);
        }
        if (email) {
            criteria.contributors = {
                $elemMatch: { email }
            }
        }

        let article = await getDB().collection(DB_REL.articles)
            .find(criteria, projectOpt).toArray();

        return article;
    }

    async function deleteDocument(id, collection) {
        return await getDB().collection(collection).deleteOne({ "_id": ObjectId(id) });
    }

    async function validateCountry({ countryId, code, name, cities }, isNew = true) {
        let validation = [];

        if (isNew) {
            let countriesQ = await getCountries({ code });
            if (!code) {
                validation.push({
                    field: "code",
                    error: ERROR_TEMPLATE.required("Country Code")
                });
            } else if (code.length !== 2 || typeof code !== "string") {
                validation.push({
                    field: "code",
                    value: code,
                    error: "Country Code must use ISO 3166-1 alpha-2"
                });
            } else if (countriesQ) {
                validation.push({
                    field: "code",
                    value: code,
                    error: ERROR_TEMPLATE.exists("Country Code", countriesQ._id, DB_REL.countries)
                });
            }
            if (!cities) {
                validation.push({
                    field: "cities",
                    error: ERROR_TEMPLATE.requiredDoc("Country", "City")
                });
            }
        } else {
            if (!countryId) {
                validation.push({
                    field: "_id",
                    value: countryId,
                    error: ERROR_TEMPLATE.required("Category Id")
                });
            } else {
                let countriesQ = await getCountries({ id: countryId });
                if (!countriesQ) {
                    validation.push({
                        field: "_id",
                        value: countryId,
                        error: ERROR_TEMPLATE.notExist("Country", DB_REL.countries)
                    });
                }
            }
        }
        if (name) {
            if (!REGEX.displayName.test(name)) {
                validation.push({
                    field: "name",
                    value: name,
                    error: ERROR_TEMPLATE.special("Country Name")
                });
            }
            if (REGEX.spaces.test(name)) {
                validation.push({
                    field: "name",
                    value: name,
                    error: ERROR_TEMPLATE.spaces("Country Name")
                });
            }
        }

        validation = [...validation, ...await validateCities({ countryCode: code, cities })];
        return validation;
    }

    async function validateCities({ countryCode, cities }) {
        let validation = [];

        if (cities) {
            cities.map(async(c) => {
                if (!c.name) {
                    validation.push({
                        field: "cities.name",
                        error: ERROR_TEMPLATE.required("City Name")
                    });
                } else {
                    if (!REGEX.displayName.test(c.name)) {
                        validation.push({
                            field: "cities.name",
                            value: c.name,
                            error: ERROR_TEMPLATE.special("City Name")
                        });
                    }
                    if (REGEX.spaces.test(c.name)) {
                        validation.push({
                            field: "cities.name",
                            value: c.name,
                            error: ERROR_TEMPLATE.spaces("City Name")
                        });
                    }
                }
                if (countryCode) {
                    let countryQ = await getCountries({ countryCode, city: c.name });
                    if (countryQ) {
                        validation.push({
                            field: "cities.name",
                            value: c.name,
                            error: ERROR_TEMPLATE.exists("City Name", countryQ._id, DB_REL.countries)
                        });
                    }
                }
                if (c.lat && !(c.lat >= -90 && c.lat <= 90)) {
                    validation.push({
                        field: "cities.lat",
                        value: c.lat,
                        error: "City Latitude must be between -90 and 90."
                    });
                }
                if (c.lat && !(c.lng >= -180 && c.lng <= 180)) {
                    validation.push({
                        field: "cities.lng",
                        value: c.lng,
                        error: "City Longitude must be between -180 and 180."
                    });
                }
                return c;
            });
        }

        return validation;
    }

    async function validateCategory({ catId, value, name, subcats }, isNew = true) {
        let validation = [];

        if (isNew) {
            if (!value) {
                validation.push({
                    field: "value",
                    error: ERROR_TEMPLATE.required("Category Value")
                });
            } else {
                let categoriesQ = await getCategories({ value });
                if (categoriesQ) {
                    validation.push({
                        field: "value",
                        error: ERROR_TEMPLATE.exists("Category Value", categoriesQ._id, DB_REL.categories)
                    });
                }
            }
            if (!name) {
                validation.push({
                    field: "name",
                    error: ERROR_TEMPLATE.required("Category Name")
                });
            }
        } else {
            if (!catId) {
                validation.push({
                    field: "_id",
                    value: catId,
                    error: ERROR_TEMPLATE.required("Category Id")
                });
            } else {
                let categoriesQ = await getCategories({ id: catId });
                if (!categoriesQ) {
                    validation.push({
                        field: "_id",
                        value: catId,
                        error: ERROR_TEMPLATE.notExist("Category", DB_REL.categories)
                    });
                }
            }
        }
        if (value && !REGEX.optionValue.test(value)) {
            validation.push({
                field: "value",
                error: ERROR_TEMPLATE.specialSpace("Category Value")
            });
        }
        if (name) {
            if (!REGEX.displayName.test(name)) {
                validation.push({
                    field: "name",
                    value: name,
                    error: ERROR_TEMPLATE.special("Category Name")
                });
            }
            if (REGEX.spaces.test(name)) {
                validation.push({
                    field: "name",
                    value: name,
                    error: ERROR_TEMPLATE.spaces("Category Name")
                });
            }
        }

        validation = [...validation, ...await validateSubCategories({ categoryValue: value, subcats })];
        return validation;
    }

    async function validateSubCategories({ categoryValue, subcats }) {
        let validation = [];

        if (subcats) {
            subcats.map(async(t) => {
                if (!t.name) {
                    validation.push({
                        field: "subcats.name",
                        error: ERROR_TEMPLATE.required("Sub-categories Name")
                    });
                } else {
                    if (!REGEX.displayName.test(t.name)) {
                        validation.push({
                            field: "subcats.name",
                            value: t.name,
                            error: ERROR_TEMPLATE.special("Sub-categories Name")
                        });
                    }
                    if (REGEX.spaces.test(t.name)) {
                        validation.push({
                            field: "subcats.name",
                            value: t.name,
                            error: ERROR_TEMPLATE.spaces("Sub-categories Name")
                        });
                    }
                }
                if (!t.value) {
                    validation.push({
                        field: "subcats.value",
                        error: ERROR_TEMPLATE.required("Sub-categories Value")
                    });
                } else {
                    if (!REGEX.optionValue.test(t.value)) {
                        validation.push({
                            field: "subcats.value",
                            value: t.value,
                            error: ERROR_TEMPLATE.specialSpace("Sub-categories Value")
                        });
                    }
                    if (REGEX.spaces.test(t.value)) {
                        validation.push({
                            field: "subcats.value",
                            value: t.value,
                            error: ERROR_TEMPLATE.spaces("Sub-categories Value")
                        });
                    }
                }
                if (categoryValue) {
                    let categoryQ = await getCategories({ categoryValue, subcat: t.value });
                    if (categoryQ) {
                        validation.push({
                            field: "subcats.value",
                            value: t.value,
                            error: ERROR_TEMPLATE.exists("Sub-categories Value", categoryQ._id, DB_REL.categories)
                        });
                    }
                }
                return t;
            });
        }

        return validation;
    }

    async function validateArticle({ articleId, title, description, details, photos, tags, contributor, location, categories }, isNew = true) {
        let validation = [];

        if (!title) {
            validation.push({
                field: "title",
                error: ERROR_TEMPLATE.required("Article Title")
            });
        } else {
            if (REGEX.spaces.test(title)) {
                validation.push({
                    field: "title",
                    value: title,
                    error: ERROR_TEMPLATE.spaces("Article Title")
                });
            }
            if (title.length > 50) {
                validation.push({
                    field: "title",
                    value: title,
                    error: ERROR_TEMPLATE.length("Article Title", "50")
                });
            }
            if (!REGEX.displayName.test(title)) {
                validation.push({
                    field: "title",
                    value: title,
                    error: ERROR_TEMPLATE.special("Article Title")
                });
            }
        }
        if (!description) {
            validation.push({
                field: "description",
                error: ERROR_TEMPLATE.required("Article Description")
            });
        } else {
            if (REGEX.spaces.test(description)) {
                validation.push({
                    field: "description",
                    value: description,
                    error: ERROR_TEMPLATE.spaces("Article Description")
                });
            }
            if (description.length > 150) {
                validation.push({
                    field: "description",
                    value: description,
                    error: ERROR_TEMPLATE.length("Article Description", "150")
                });
            }
        }
        if (photos) {
            photos.map(p => {
                if (!REGEX.url.test(p)) {
                    validation.push({
                        field: "photos.$",
                        value: p,
                        error: ERROR_TEMPLATE.url("Article Photo URL")
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
                        error: ERROR_TEMPLATE.special("Article Tag")
                    });
                }
            });
        }
        if (!contributor) {
            validation.push({
                field: "contributor",
                error: ERROR_TEMPLATE.required("Article Contributor")
            });
        } else {
            let { displayName, name: cName, email: cEmail } = contributor;
            if (displayName) {
                if (displayName.length > 80) {
                    validation.push({
                        field: "contributor.displayName",
                        value: displayName,
                        error: ERROR_TEMPLATE.length("Article Contributor Display Name", 80)
                    });
                }
                if (REGEX.spaces.test(displayName)) {
                    validation.push({
                        field: "contributor.displayName",
                        value: displayName,
                        error: ERROR_TEMPLATE.spaces("Article Contributor Display Name")
                    });
                }
                if (!REGEX.displayName.test(displayName)) {
                    validation.push({
                        field: "contributor.displayName",
                        value: displayName,
                        error: ERROR_TEMPLATE.special("Article Contributor Display Name")
                    });
                }
            }
            if (!cName) {
                validation.push({
                    field: "contributor.name",
                    error: ERROR_TEMPLATE.required("Article Contributor Name")
                });
            } else {
                if (cName.length > 80) {
                    validation.push({
                        field: "contributor.name",
                        value: cName,
                        error: ERROR_TEMPLATE.length("Article Contributor Name", 80)
                    });
                }
                if (REGEX.spaces.test(cName)) {
                    validation.push({
                        field: "contributor.name",
                        value: cName,
                        error: ERROR_TEMPLATE.spaces("Article Contributor Name")
                    });
                }
                if (!REGEX.displayName.test(cName)) {
                    validation.push({
                        field: "contributor.name",
                        value: cName,
                        error: ERROR_TEMPLATE.special("Article Contributor Name")
                    });
                }
            }
            if (!cEmail) {
                validation.push({
                    field: "contributor.email",
                    error: ERROR_TEMPLATE.required("Article Contributor Email")
                });
            } else if (!REGEX.email.test(cEmail) || typeof cEmail !== "string") {
                validation.push({
                    field: "contributor.email",
                    value: cEmail,
                    error: ERROR_TEMPLATE.email("Article Contributor Email")
                });
            }
        }
        if (!location) {
            validation.push({
                field: "location",
                error: ERROR_TEMPLATE.required("Article Location")
            });
        } else {
            let { countryId, cityId, address } = location;
            if (!countryId) {
                validation.push({
                    field: "location.countryId",
                    error: ERROR_TEMPLATE.required("Article Location Country Id")
                });
            } else {
                let countryQ = await getCountries({ id: countryId });
                if (!countryQ) {
                    validation.push({
                        field: "location.countryId",
                        value: countryId,
                        error: ERROR_TEMPLATE.notExist("Article Location Country Id", DB_REL.countries)
                    });
                } else {
                    if (!cityId) {
                        validation.push({
                            field: "location.cityId",
                            error: ERROR_TEMPLATE.required("Article Location City Id")
                        });
                    } else {
                        let cityQ = await getCountries({ id: countryId, city: cityId });
                        if (!cityQ) {
                            validation.push({
                                field: "location.cityId",
                                value: cityId,
                                error: ERROR_TEMPLATE.notExist("Article Location City Id", DB_REL.countries)
                            });
                        }
                    }
                }
            }
            if (!address) {
                validation.push({
                    field: "location.address",
                    error: ERROR_TEMPLATE.required("Article Location Address")
                });
            } else if (REGEX.spaces.test(address)) {
                validation.push({
                    field: "address",
                    value: address,
                    error: ERROR_TEMPLATE.spaces("Article Location Address")
                });
            }
        }
        if (!categories) {
            validation.push({
                field: "categories",
                error: ERROR_TEMPLATE.required("Article Categories")
            });
        } else {
            categories.map(async(c) => {
                let catId = c.catId;
                if (!catId) {
                    validation.push({
                        field: "categories.catId",
                        error: ERROR_TEMPLATE.required("Article Category Id")
                    });
                } else {
                    let categoryQ = await getCountries({ id: catId });
                    if (ObjectId.isValid(catId) || !categoryQ) {
                        validation.push({
                            field: "categories.catId",
                            value: catId,
                            error: ERROR_TEMPLATE.notExist("Article Category Id", DB_REL.categories)
                        });
                    } else {
                        c.subcatIds.map(async(subcat) => {
                            let subCatQ = await getCountries({ id: catId, subcat });
                            if (ObjectId.isValid(s) || !subCatQ) {
                                validation.push({
                                    field: "location.subcatIds",
                                    value: subcat,
                                    error: ERROR_TEMPLATE.notExist("Article Sub-category Id", DB_REL.categories)
                                });
                            }
                        });
                    }
                }
            })
        }
        if (details) {
            details.map(d => {
                if (!d.sectionName) {
                    validation.push({
                        field: "details.sectionName",
                        error: ERROR_TEMPLATE.required("Article Section Name")
                    });
                } else {
                    if (!REGEX.displayName.test(d.sectionName)) {
                        validation.push({
                            field: "details.sectionName",
                            value: d.sectionName,
                            error: ERROR_TEMPLATE.required("Article Section Name")
                        });
                    }
                    if (!d.content) {
                        validation.push({
                            field: "details.content",
                            error: ERROR_TEMPLATE.required("Article Section Content")
                        });
                    } else if (REGEX.spaces.test(d.content)) {
                        validation.push({
                            field: "details.content",
                            value: d.content,
                            error: ERROR_TEMPLATE.spaces("Article Section Content")
                        });

                    }
                }
                return d;
            })
        }

        return validation;
    }

    app.get("/countries", async function(req, res) {
        let { countryId } = req.query;

        if (countryId && !ObjectId.isValid(countryId)) {
            sendInvalidError(res, [{ field: "countryId", value: countryId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let countries = await getCountries(req.query);
                sendSuccess(res, countries);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.read(DB_REL.countries));
            }
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
                let ack = await getDB().collection(DB_REL.countries)
                    .insertOne({ code, name, cities });
                sendSuccess(res, ack);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(res, ERROR_TEMPLATE.create(DB_REL.countries));
        }
    });

    app.put("/country", async function(req, res) {
        let { countryId } = req.body;

        if (!ObjectId.isValid(countryId)) {
            sendInvalidError(res, [{ field: "countryId", value: countryId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let validation = await validateCountry(req.body, false);

                if (!validation.length) {
                    let { name, cities } = req.body;
                    let update = { $set: {} };

                    if (name) {
                        update.$set.name = name;
                    }
                    if (cities) {
                        let countryQ = await getCountries({ countryId }, true);
                        cities = [...countryQ.cities, ...cities];
                        cities = cities.map((c) => {
                            if (!c._id) {
                                c._id = new ObjectId();
                            }
                            return c;
                        });
                        update.$set.cities = cities;
                    }

                    let ack = await getDB().collection(DB_REL.countries)
                        .updateOne({ "_id": ObjectId(countryId) }, update);
                    sendSuccess(res, ack);
                } else {
                    sendInvalidError(res, validation);
                }
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.update(DB_REL.countries, countryId));
            }
        }
    });

    app.delete("/country", async function(req, res) {
        let { countryId } = req.body;

        if (!ObjectId.isValid(countryId)) {
            sendInvalidError(res, [{ field: "_id", value: countryId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let ack = await deleteDocument(countryId, DB_REL.countries);
                sendSuccess(res, ack);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.delete(DB_REL.countries, countryId));
            }
        }
    });

    app.get("/countries/cities", async function(req, res) {
        let { countryId } = req.query;

        if (countryId && !ObjectId.isValid(countryId)) {
            sendInvalidError(res, [{ field: "countryId", value: countryId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let countries = await getCountries(req.query, true);
                sendSuccess(res, countries);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.read(DB_REL.countries));
            }
        }
    });

    app.post("/country/city", async function(req, res) {
        let { countryId, name, lat, lng } = req.body;

        if (!countryId || !ObjectId.isValid(countryId)) {
            sendInvalidError(res, [{ field: "countryId", value: countryId, error: ERROR_TEMPLATE.id }]);
        } else {
            let existCountry = await getCountries({ countryId });

            if (existCountry) {
                try {
                    let validation = await validateCities({ countryCode: existCountry[0].code, cities: [{ name, lat, lng }] });
                    if (!validation.length) {
                        let update = {
                            $push: {
                                cities: {
                                    _id: new ObjectId(),
                                    name,
                                    lat: lat || null,
                                    lng: lng || null
                                }
                            }
                        };
                        let ack = await getDB().collection(DB_REL.countries)
                            .updateOne({ "_id": ObjectId(countryId) }, update);
                        sendSuccess(res, ack);
                    } else {
                        sendInvalidError(res, validation);
                    }
                } catch (err) {
                    sendServerError(res, ERROR_TEMPLATE.createEmbed(DB_REL.countries, "cities", countryId));
                }
            }
        }
    });

    app.put("/country/city", async function(req, res) {
        let { countryId, cityId, name, lat, lng } = req.body;
        let idValidation = [];

        if (!countryId || !ObjectId.isValid(countryId)) {
            idValidation.push({ field: "countryId", value: countryId, error: ERROR_TEMPLATE.id });
        }
        if (!cityId || !ObjectId.isValid(cityId)) {
            idValidation.push({ field: "cityId", value: cityId, error: ERROR_TEMPLATE.id });
        }

        if (idValidation) {
            sendInvalidError(res, idValidation);
        } else {
            let existCountry = await getCountries({ countryId, city: cityId });

            if (existCountry) {
                try {
                    let validation = await validateCities({ countryCode: existCountry[0].code, cities: [{ name, lat, lng }] });
                    if (!validation.length) {
                        let update = { $set: {} };
                        if (name) {
                            update.$set["cities.$.name"] = name;
                        }
                        if (lat) {
                            update.$set["cities.$.lat"] = lat;
                        }
                        if (lng) {
                            update.$set["cities.$.lng"] = lng;
                        }
                        let ack = await getDB().collection(DB_REL.countries)
                            .updateOne({ "_id": ObjectId(countryId), "cities._id": ObjectId(cityId) },
                                update
                            );
                        sendSuccess(res, ack);
                    } else {
                        sendInvalidError(res, validation);
                    }
                } catch (err) {
                    sendServerError(res, ERROR_TEMPLATE.updateEmbed(DB_REL.countries, cityId, countryId));
                }
            }
        }
    });

    app.delete("/country/city", async function(req, res) {
        let { countryId, cityId } = req.body;
        let idValidation = [];

        if (!countryId || !ObjectId.isValid(countryId)) {
            idValidation.push({ field: "countryId", value: countryId, error: ERROR_TEMPLATE.id });
        }
        if (!cityId || !ObjectId.isValid(cityId)) {
            idValidation.push({ field: "cityId", value: cityId, error: ERROR_TEMPLATE.id });
        }

        if (idValidation) {
            sendInvalidError(res, idValidation);
        } else {
            try {
                let ack = await getDB().collection(DB_REL.countries)
                    .updateOne({ "_id": ObjectId(countryId), "cities._id": ObjectId(cityId) }, { $pull: { cities: { "_id": ObjectId(cityId) } } });
                sendSuccess(res, ack);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.deleteEmbed(DB_REL.countries, cityId, countryId));
            }
        }
    });

    app.get("/categories", async function(req, res) {
        let { catId } = req.query;

        if (catId && !ObjectId.isValid(catId)) {
            sendInvalidError(res, [{ field: "catId", value: catId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let categories = await getCategories(req.query);
                sendSuccess(res, categories);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.read(DB_REL.categories));
            }
        }
    });

    app.post("/category", async function(req, res) {
        try {
            let validation = await validateCategory(req.body, true);

            if (!validation.length) {
                let { value, name, subcats } = req.body;
                let ack = await getDB().collection(DB_REL.categories)
                    .insertOne({ value, name, subcats });
                sendSuccess(res, ack);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(res, ERROR_TEMPLATE.create(DB_REL.categories));
        }
    });

    app.put("/category", async function(req, res) {
        let { catId } = req.body;

        if (!catId || !ObjectId.isValid(catId)) {
            sendInvalidError(res, [{ field: "catId", value: catId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let validation = await validateCategory(req.body, false);

                if (!validation.length) {
                    let { name, subcats } = req.body;
                    let update = { $set: {} };
                    if (name) {
                        update.$set.name = name;
                    }
                    if (subcats) {
                        let categoryQ = await getCategories({ catId }, true);
                        subcats = [...categoryQ.subcats, ...subcats];
                        subcats = subcats.map(s => {
                            if (!s._id) {
                                s._id = new ObjectId();
                            }
                            return s;
                        });
                        update.$set.subcats = subcats;
                    }
                    let ack = await getDB().collection(DB_REL.categories)
                        .updateOne({ "_id": ObjectId(id) }, update);
                    sendSuccess(res, ack);
                } else {
                    sendInvalidError(res, validation);
                }
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.update(DB_REL.categories, id));
            }
        }
    });

    app.delete("/category", async function(req, res) {
        let { catId } = req.body;

        if (!catId || !ObjectId.isValid(catId)) {
            sendInvalidError(res, [{ field: "catId", value: catId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let ack = await deleteDocument(catId, DB_REL.categories);
                sendSuccess(res, ack);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.delete(DB_REL.categories, catId));
            }
        }
    });

    app.get("/categories/subcats", async function(req, res) {
        let { catId } = req.query;

        if (catId && !ObjectId.isValid(catId)) {
            sendInvalidError(res, [{ field: "catId", value: catId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let categories = await getCategories(req.query, true);
                sendSuccess(res, categories);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.update(DB_REL.categories));
            }
        }
    });

    app.post("/category/subcat", async function(req, res) {
        let { catId, name, value } = req.body;

        if (!catId || !ObjectId.isValid(catId)) {
            sendInvalidError(res, [{ field: "catId", value: catId, error: ERROR_TEMPLATE.id }]);
        } else {
            let existCategory = await getCategories({ catId });

            if (existCategory) {
                try {
                    let validation = await validateSubCategories({ categoryValue: existCategory[0].value, subcats: [{ name, value }] });
                    if (!validation.length) {
                        let update = {
                            $push: {
                                subcats: {
                                    _id: new ObjectId(),
                                    name,
                                    value
                                }
                            }
                        };
                        let ack = await getDB().collection(DB_REL.categories)
                            .updateOne({ "_id": ObjectId(catId) }, update);
                        sendSuccess(res, ack);
                    } else {
                        sendInvalidError(res, validation);
                    }
                } catch (err) {
                    sendServerError(res, ERROR_TEMPLATE.createEmbed(DB_REL.categories, "subcats", catId));
                }
            }
        }
    });

    app.put("/category/subcat", async function(req, res) {
        let { catId, subcatId, name, value } = req.body;
        let idValidation = [];

        if (!catId || !ObjectId.isValid(catId)) {
            idValidation.push({ field: "catId", value: catId, error: ERROR_TEMPLATE.id });
        }
        if (!subcatId || !ObjectId.isValid(subcatId)) {
            idValidation.push({ field: "subcatId", value: subcatId, error: ERROR_TEMPLATE.id });
        }

        if (idValidation) {
            sendInvalidError(res, idValidation);
        } else {
            let existCategory = await getCategories({ catId, subcat: subcatId });

            if (existCategory) {
                try {
                    let validation = await validateSubCategories({ categoryValue: existCategory[0].value, subcat: [{ name, value }] });
                    if (!validation.length) {
                        let update = { $set: {} };
                        if (name) {
                            update.$set["subcats.$.name"] = name;
                        }
                        if (value) {
                            update.$set["subcats.$.value"] = value;
                        }
                        let ack = await getDB().collection(DB_REL.categories)
                            .updateOne({ "_id": ObjectId(catId), "subcats._id": ObjectId(subcatId) }, update);
                        sendSuccess(res, ack);
                    } else {
                        sendInvalidError(res, validation);
                    }
                } catch (err) {
                    sendServerError(res, ERROR_TEMPLATE.updateEmbed(DB_REL.categories, subcatId, catId));
                }
            }
        }
    });

    app.delete("/category/subcat", async function(req, res) {
        let { catId, subcatId } = req.body;
        let idValidation = [];

        if (!catId || !ObjectId.isValid(catId)) {
            idValidation.push({ field: "catId", value: catId, error: ERROR_TEMPLATE.id });
        }
        if (!subcatId || !ObjectId.isValid(subcatId)) {
            idValidation.push({ field: "subcatId", value: subcatId, error: ERROR_TEMPLATE.id });
        }

        if (idValidation) {
            sendInvalidError(res, idValidation);
        } else {
            try {
                let ack = await getDB().collection(DB_REL.categories)
                    .updateOne({ "_id": ObjectId(catId), "subcats._id": ObjectId(subcatId) }, { $pull: { subcats: { "_id": ObjectId(subcatId) } } });
                sendSuccess(res, ack);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.deleteEmbed(DB_REL.categories, subcatId, catId));
            }
        }
    });

    app.get("/articles", async function(req, res) {
        let { articleId } = req.query;

        if (articleId && !ObjectId.isValid(articleId)) {
            sendInvalidError(res, [{ field: "articleId", value: articleId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let articles = await getArticles(req.query);
                sendSuccess(res, articles);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.read(DB_REL.articles));
            }
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

                let ack = await getDB().collection(DB_REL.articles).insertOne(insert);
                sendSuccess(res, ack);
            } else {
                sendInvalidError(res, validation);
            }
        } catch (err) {
            sendServerError(res, ERROR_TEMPLATE.create(DB_REL.articles));
        }
    });

    app.put("/article", async function(req, res) {
        let { articleId } = req.body;

        if (!ObjectId.isValid(articleId)) {
            sendInvalidError(res, [{ field: "articleId", value: articleId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let validation = await validateArticle(req.body);

                if (!validation.length) {
                    let { title, description, details, photos, tags, categories, contributor } = req.body;
                    let update = { $set: {} };

                    contributor.displayName = contributor.displayName || contributor.name;
                    contributor.isLastMod = true;

                    if (title) {
                        update.$set.title = title;
                    }
                    if (description) {
                        update.$set.title = title;
                    }
                    if (details) {
                        update.$set.details = details;
                    }
                    if (photos) {
                        update.$set.photos = photos;
                    }
                    if (tags) {
                        update.$set.tags = tags;
                    }
                    if (categories) {
                        update.$set.categories = categories;
                    }
                    if (contributor) {
                        update.$set.contributor = contributor;
                    }

                    let ack = await getDB().collection(DB_REL.articles)
                        .updateOne({ "_id": ObjectId(articleId) }, update);
                    sendSuccess(res, ack);
                } else {
                    sendInvalidError(res, validation);
                }
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.update(DB_REL.articles, articleId));
            }
        }
    });

    app.delete("/article", async function(req, res) {
        let { articleId } = req.body;

        if (!articleId || !ObjectId.isValid(articleId)) {
            sendInvalidError(res, [{ field: "articleId", value: articleId, error: ERROR_TEMPLATE.id }]);
        } else {
            try {
                let ack = await deleteDocument(id, DB_REL.articles);
                sendSuccess(res, ack);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.delete(DB_REL.articles, articleId));
            }
        }
    });

    app.get("/article/contributor", async function(req, res) {
        let { articleId, email } = req.query;
        let validation = [];

        if (!articleId || !ObjectId.isValid(articleId)) {
            validation.push({ field: "articleId", value: articleId, error: ERROR_TEMPLATE.id });
        } else {
            if (!email) {
                validation.push({
                    field: "email",
                    error: ERROR_TEMPLATE.required("Contributor Email")
                });
            } else if (REGEX.email.test(email) || typeof email !== string) {
                validation.push({
                    field: "email",
                    value: email,
                    error: ERROR_TEMPLATE.email("Contributor Email")
                });
            }
        }

        if (validation) {
            sendInvalidError(res, validation);
        } else {
            try {
                let article = await getArticleContributors({ articleId, email });
                sendSuccess(res, article);
            } catch (err) {
                sendServerError(res, ERROR_TEMPLATE.readEmbed(DB_REL.articles, "contributors", id));
            }
        }
    });

    app.put("/article/rating", async function(req, res) {
        let { articleId, rating } = req.body;

        if (!articleId || !ObjectId.isValid(articleId)) {
            sendInvalidError(res, [{ field: "articleId", value: articleId, error: ERROR_TEMPLATE.id }]);
        } else {
            let existArticle = await getArticles({ articleId });

            if (existArticle) {
                try {
                    let validation = [];

                    if (!rating) {
                        validation.push({
                            field: "rating",
                            error: ERROR_TEMPLATE.required("Rating")
                        });
                    } else if (isNaN(rating)) {
                        validation.push({
                            field: "rating",
                            value: rating,
                            error: "Rating must be of number type",
                        });
                    } else if (rating < 0 || rating > 5) {
                        validation.push({
                            field: "avg",
                            value: rating,
                            error: "Rating cannot be less than 0 or more than 5",
                        });
                    }

                    if (!validation.length) {
                        let update = {
                            $set: { avg: rating },
                            $inc: { count: 1 }
                        };
                        let article = await getDB()
                            .collection(DB_REL.articles)
                            .updateOne({ "_id": ObjectId(id) }, update);
                        sendSuccess(res, article);
                    } else {
                        sendInvalidError(res, validation);
                    }
                } catch (err) {
                    sendServerError(res, ERROR_TEMPLATE.createEmbed(DB_REL.articles, "rating", articleId));
                }
            }
        }
    });

    app.post("/article/comment", async function(req, res) {
        let { articleId, name, content, email } = req.body;

        if (!articleId || !ObjectId.isValid(articleId)) {
            sendInvalidError(res, [{ field: "articleId", value: articleId, error: ERROR_TEMPLATE.id }]);
        } else {
            let existArticle = await getArticles({ articleId });

            if (existArticle) {
                try {
                    let validation = [];

                    if (!name) {
                        validation.push({
                            field: "name",
                            error: ERROR_TEMPLATE.required("Comment Name")
                        });
                    } else if (!REGEX.displayName.test(name)) {
                        validation.push({
                            field: "name",
                            value: name,
                            error: ERROR_TEMPLATE.special("Comment Name")
                        });
                    }
                    if (!email) {
                        validation.push({
                            field: "content",
                            error: ERROR_TEMPLATE.required("Comment Email")
                        });
                    } else if (!REGEX.email.test(email)) {
                        validation.push({
                            field: "email",
                            value: email,
                            error: ERROR_TEMPLATE.email("Comment Email")
                        });
                    }
                    if (!content) {
                        validation.push({
                            field: "content",
                            error: ERROR_TEMPLATE.required("Comment Content")
                        });
                    }

                    if (!validation.length) {
                        let update = {
                            $push: {
                                comments: {
                                    _id: new ObjectId(),
                                    name,
                                    content,
                                    email,
                                    createdDate: new Date()
                                }
                            }
                        };
                        let article = await getDB().collection(DB_REL.articles)
                            .updateOne({ "_id": ObjectId(id) }, update);
                        sendSuccess(res, article);
                    } else {
                        sendInvalidError(res, validation);
                    }
                } catch (err) {
                    sendServerError(res, ERROR_TEMPLATE.createEmbed(DB_REL.articles, "comment", articleId));
                }
            }
        }
    });
}

main();

app.listen(portNum, function() {
    console.log("Server has started");
});