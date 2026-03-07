import os
from osgeo import gdal

def convert_tif_to_exr(input_path, output_path):
    """
    Chuyển đổi một file đơn lẻ từ TIF sang EXR giữ nguyên 32-bit Float.
    """
    # Mở file nguồn
    ds = gdal.Open(input_path)
    if ds is None:
        print(f"Không thể mở file: {input_path}")
        return

    # Thiết lập tùy chọn chuyển đổi
    # - format: 'EXR'
    # - outputType: gdal.GDT_Float32 (đảm bảo giữ độ chính xác địa hình)
    options = gdal.TranslateOptions(
        format='EXR',
        outputType=gdal.GDT_Float32,
        creationOptions=['COMPRESSION=PIZ'] # PIZ là thuật toán nén tốt cho dữ liệu quét
    )

    # Thực hiện chuyển đổi
    gdal.Translate(output_path, ds, options=options)
    print(f"Đã chuyển đổi: {os.path.basename(input_path)} -> {os.path.basename(output_path)}")

def batch_convert(input_folder, output_folder):
    """
    Chuyển đổi toàn bộ folder file .tif sang .exr
    """
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    for filename in os.listdir(input_folder):
        if filename.lower().endswith(".tif") or filename.lower().endswith(".tiff"):
            input_file = os.path.join(input_folder, filename)
            # Đổi đuôi file thành .exr
            output_file = os.path.join(output_folder, os.path.splitext(filename)[0] + ".exr")
            
            convert_tif_to_exr(input_file, output_file)

if __name__ == "__main__":
    # Đường dẫn thư mục chứa các mảnh tile .tif của bạn
    FOLDER_INPUT = "raw/copernicus-dem/Copernicus_DSM_COG_10_N10_00_E106_00_DEM" 
    FOLDER_OUTPUT = "processed/copernicus-dem/Copernicus_DSM_COG_10_N10_00_E106_00_DEM"

    batch_convert(FOLDER_INPUT, FOLDER_OUTPUT)
    print("\n--- HOÀN THÀNH QUÁ TRÌNH CHUYỂN ĐỔI ---")