#!/usr/bin/env node

import { client } from "../src/client";

client(process.argv.slice(2))
  .then((result) => {
    console.log(result.message);
    process.exit(result.code ?? 0);
  })
  .catch((err) => {
    // `client` shouldn't reject, but just in case
    console.log(err.message);
    process.exit(3);
  });
