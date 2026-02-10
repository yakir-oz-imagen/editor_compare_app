import os
from flask import Flask, render_template, request, jsonify, send_from_directory, abort

app = Flask(__name__)

IMAGE_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.tiff', '.tif', '.bmp', '.svg',
}


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
    """Return filenames that exist across ALL provided folder paths."""
    data = request.get_json(force=True)
    folders = data.get('folders', [])

    if not folders:
        return jsonify({'images': []})

    sets = []
    for folder_path in folders:
        images = list_images_in_folder(folder_path)
        sets.append(set(images))

    intersection = sets[0]
    for s in sets[1:]:
        intersection &= s

    return jsonify({'images': sorted(intersection)})


@app.route('/api/image')
def serve_image():
    """Serve a single image file from a given folder."""
    folder = request.args.get('folder', '')
    name = request.args.get('name', '')

    if not folder or not name:
        abort(400)

    folder = os.path.abspath(folder)

    if not os.path.isdir(folder):
        abort(404)

    file_path = os.path.join(folder, name)
    if not os.path.isfile(file_path) or not is_image_file(name):
        abort(404)

    # Security: ensure the resolved path is within the folder
    if not os.path.abspath(file_path).startswith(folder):
        abort(403)

    return send_from_directory(folder, name)


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
