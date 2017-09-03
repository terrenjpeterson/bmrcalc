#!/bin/bash
# create build package for Alexa skill and stage in S3 bucket for deployment

cd ..

zip -r build.zip index.js package.json node_modules/

aws s3 cp build.zip s3://metablogiccalculator/binaries/
