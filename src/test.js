import "./global.js";

require("source-map-support").install();

const chai = global.chai = require("chai");
global.expect = chai.expect;

chai.use(require("chai-http"));
chai.use(require("chai-as-promised"));

chai.should();

global.serverLog = () => {};

describe("Unit tests", function(){
    require("./tests/units.js");
});

describe("Server tests", function(){
    require("./tests/test.js");
});

(serverConst.dbopts ? describe : describe.skip)("Database tests", function(){
    require("./tests/initdbtest.js");
    require("./tests/dbtest.js");
});
