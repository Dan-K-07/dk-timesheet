"use strict";

/* ============ Init ============ */
load();
render();
var remembered = loadPin();
if (remembered) attemptLogin(remembered, { silent: true });
