import io
import os
from flask import Flask, render_template, request, jsonify, send_from_directory, send_file, abort
from PIL import Image

app = Flask(__name__)

IMAGE_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.tiff', '.tif', '.bmp', '.svg',
}

# Formats that browsers cannot display natively — convert to PNG before serving
CONVERT_TO_PNG = {'.tiff', '.tif', '.bmp'}


def is_image_file(filename):
    _, ext = os.path.splitext(filename)
    return ext.lower() in IMAGE_EXTENSIONS


def list_images_in_folder(folder_path):
    """Return a sorted list of image filenames in the given folder."""
    try:
        return sorted(
            f for f in os.listdir(folder_path)
            if os.path.isfile(os.path.join(folder_path, f)) and is_image_file(f)
        )
    except OSError:
        return []


def get_image_stems(folder_path):
    """Return a set of image stems (filenames without extension) in the folder."""
    stems = set()
    try:
        for f in os.listdir(folder_path):
            if os.path.isfile(os.path.join(folder_path, f)) and is_image_file(f):
                stems.add(os.path.splitext(f)[0])
    except OSError:
        pass
    return stems


def find_image_by_stem(folder_path, stem):
    """Find the actual filename for an image stem in a folder."""
    try:
        for f in os.listdir(folder_path):
            if os.path.isfile(os.path.join(folder_path, f)) and is_image_file(f):
                if os.path.splitext(f)[0] == stem:
                    return f
    except OSError:
        pass
    return None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/folders', methods=['POST'])
def add_folder():
    """Validate a folder path and return its image list."""
    data = request.get_json(force=True)
    folder_path = data.get('path', '').strip()

    if not folder_path:
        return jsonify({'error': 'No path provided'}), 400

    folder_path = os.path.abspath(folder_path)

    if not os.path.isdir(folder_path):
        return jsonify({'error': f'Directory not found: {folder_path}'}), 404

    images = list_images_in_folder(folder_path)
    if not images:
        return jsonify({'error': f'No supported images found in: {folder_path}'}), 400

    return jsonify({
        'path': folder_path,
        'images': images,
    })


@app.route('/api/images', methods=['POST'])
def get_images_intersection():
    """Return image stems that exist across ALL provided folder paths.

    Matching is by stem (filename without extension), so image1.jpg and
    image1.tif are considered the same image.
    """
    data = request.get_json(force=True)
    folders = data.get('folders', [])

    if not folders:
        return jsonify({'images': []})

    stem_sets = [get_image_stems(folder_path) for folder_path in folders]

    intersection = stem_sets[0]
    for s in stem_sets[1:]:
        intersection &= s

    return jsonify({'images': sorted(intersection)})


@app.route('/api/image')
def serve_image():
    """Serve a single image file from a given folder.

    The 'name' parameter can be a full filename or a stem (without extension).
    If it's a stem, the first matching image file in the folder is served.
    """
    folder = request.args.get('folder', '')
    name = request.args.get('name', '')

    if not folder or not name:
        abort(400)

    folder = os.path.abspath(folder)

    if not os.path.isdir(folder):
        abort(404)

    # Try exact filename first
    file_path = os.path.join(folder, name)
    if os.path.isfile(file_path) and is_image_file(name):
        actual_name = name
    else:
        # Treat name as a stem and find the matching image
        actual_name = find_image_by_stem(folder, name)
        if not actual_name:
            abort(404)
        file_path = os.path.join(folder, actual_name)

    # Security: ensure the resolved path is within the folder
    if not os.path.abspath(file_path).startswith(folder):
        abort(403)

    # Convert browser-unsupported formats (TIFF, BMP) to PNG on the fly
    ext = os.path.splitext(actual_name)[1].lower()
    if ext in CONVERT_TO_PNG:
        try:
            img = Image.open(file_path)
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            buf.seek(0)
            return send_file(buf, mimetype='image/png')
        except Exception:
            abort(500)

    return send_from_directory(folder, actual_name)


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
