BBOX="106,10,107,11"
LOCATION="ho_chi_minh_city"

mkdir -p ./data/raw

spin() {
  local pid=$1
  local label=$2
  local chars="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  %s  %s" "${chars:i%${#chars}:1}" "$label"
    i=$((i + 1))
    sleep 0.1
  done
  wait "$pid"
  local rc=$?
  if [ $rc -eq 0 ]; then
    printf "\r  ✔  %s\n" "$label"
  else
    printf "\r  ✖  %s\n" "$label"
    return $rc
  fi
}

TYPES=(
  building address bathymetry building_part division division_area
  division_boundary place segment connector infrastructure land
  land_cover land_use water
)

for type in "${TYPES[@]}"; do
  cmd="overturemaps download --bbox=$BBOX -f geojson --type=$type -o ./data/raw/overture-maps/N10_00_E106_00_${type}.geojson"
  echo "  $ $cmd"
  $cmd &>/dev/null &
  spin $! "Download $type"
done

S3_BUCKET="geospatialdatastack-databuckete3889a50-jkve0kjmmfvd"
cmd="aws s3 sync ./data/raw/ s3://${S3_BUCKET}/raw/"
echo "  $ $cmd"
$cmd &>/dev/null &
spin $! "Upload to S3"
