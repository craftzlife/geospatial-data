import os
from osgeo import gdal

def slice_dem_for_unity(input_tif, output_dir, tile_size=256):
    ds = gdal.Open(input_tif)
    
    # Đảm bảo output folder tồn tại
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Lấy thông tin kích thước
    width = ds.RasterXSize
    height = ds.RasterYSize

    print(f"Bắt đầu cắt file thành mảnh {tile_size}x{tile_size}...")

    for i in range(0, width, tile_size):
        for j in range(0, height, tile_size):
            w = min(tile_size, width - i)
            h = min(tile_size, height - j)
            
            # Xuất ra định dạng .exr (Nhẹ hơn .tif nhưng vẫn giữ 32-bit Float)
            # Hoặc dùng định dạng .raw để Unity đọc thẳng vào mảng
            output_path = os.path.join(output_dir, f"tile_{i}_{j}.exr")
            
            gdal.Translate(output_path, ds, 
                           srcWin=[i, j, w, h], 
                           format='EXR', 
                           outputType=gdal.GDT_Float32)

    print("--- HOÀN THÀNH ---")


slice_dem_for_unity("raw/copernicus-dem/Copernicus_DSM_COG_10_N10_00_E106_00_DEM/Copernicus_DSM_COG_10_N10_00_E106_00_DEM.tif", "processed/terrain_tiles")