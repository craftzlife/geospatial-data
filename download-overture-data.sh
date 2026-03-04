BBOX="106.64085,10.84756,106.75782,10.92139"
LOCATION="ho_chi_minh_city"

mkdir -p ./data/raw

overturemaps download --bbox=$BBOX -f geojson --type=building -o ./data/raw/${LOCATION}_building.geojson
overturemaps download --bbox=$BBOX -f geojson --type=address -o ./data/raw/${LOCATION}_address.geojson
overturemaps download --bbox=$BBOX -f geojson --type=bathymetry -o ./data/raw/${LOCATION}_bathymetry.geojson
overturemaps download --bbox=$BBOX -f geojson --type=building_part -o ./data/raw/${LOCATION}_building_part.geojson
overturemaps download --bbox=$BBOX -f geojson --type=division -o ./data/raw/${LOCATION}_division.geojson
overturemaps download --bbox=$BBOX -f geojson --type=division_area -o ./data/raw/${LOCATION}_division_area.geojson
overturemaps download --bbox=$BBOX -f geojson --type=division_boundary -o ./data/raw/${LOCATION}_division_boundary.geojson
overturemaps download --bbox=$BBOX -f geojson --type=place -o ./data/raw/${LOCATION}_place.geojson
overturemaps download --bbox=$BBOX -f geojson --type=segment -o ./data/raw/${LOCATION}_segment.geojson
overturemaps download --bbox=$BBOX -f geojson --type=connector -o ./data/raw/${LOCATION}_connector.geojson
overturemaps download --bbox=$BBOX -f geojson --type=infrastructure -o ./data/raw/${LOCATION}_infrastructure.geojson
overturemaps download --bbox=$BBOX -f geojson --type=land -o ./data/raw/${LOCATION}_land.geojson
overturemaps download --bbox=$BBOX -f geojson --type=land_cover -o ./data/raw/${LOCATION}_land_cover.geojson
overturemaps download --bbox=$BBOX -f geojson --type=land_use -o ./data/raw/${LOCATION}_land_use.geojson
overturemaps download --bbox=$BBOX -f geojson --type=water -o ./data/raw/${LOCATION}_water.geojson

S3_BUCKET="overturemapsgeospatialdatastack-databuckete3889a50-ybo0e2chjflg"
aws --profile 101 s3 sync ./data/ s3://${S3_BUCKET}/
