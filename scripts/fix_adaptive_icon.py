"""
Fix adaptive icon foreground to properly fit within Android's safe zone.
Android adaptive icons mask the outer ~18% on each side, so content should be
within the inner 66% (safe zone) of the image.
"""
from PIL import Image
import os

def create_adaptive_foreground(input_path, output_path, canvas_size=1024):
    """
    Create a properly sized adaptive foreground icon.
    The logo will be scaled to fit within the safe zone (inner 66%).
    """
    # Open the original icon
    img = Image.open(input_path).convert('RGBA')
    
    # Calculate safe zone size (66% of canvas)
    safe_zone_size = int(canvas_size * 0.66)
    
    # Scale the image to fit within safe zone while maintaining aspect ratio
    img_ratio = img.width / img.height
    if img_ratio > 1:
        new_width = safe_zone_size
        new_height = int(safe_zone_size / img_ratio)
    else:
        new_height = safe_zone_size
        new_width = int(safe_zone_size * img_ratio)
    
    # Resize with high quality
    img_resized = img.resize((new_width, new_height), Image.LANCZOS)
    
    # Create transparent canvas
    canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    
    # Center the resized image on canvas
    x_offset = (canvas_size - new_width) // 2
    y_offset = (canvas_size - new_height) // 2
    
    canvas.paste(img_resized, (x_offset, y_offset), img_resized)
    
    # Save
    canvas.save(output_path, 'PNG')
    print(f"Created: {output_path}")

def create_app_icon(input_path, output_path, size=1024):
    """
    Create a standard app icon with proper padding.
    """
    img = Image.open(input_path).convert('RGBA')
    
    # Scale to fit with some padding (90% of canvas)
    content_size = int(size * 0.90)
    
    img_ratio = img.width / img.height
    if img_ratio > 1:
        new_width = content_size
        new_height = int(content_size / img_ratio)
    else:
        new_height = content_size
        new_width = int(content_size * img_ratio)
    
    img_resized = img.resize((new_width, new_height), Image.LANCZOS)
    
    # Create canvas with red background (matching the icon style)
    canvas = Image.new('RGBA', (size, size), (229, 57, 53, 255))  # #E53935
    
    x_offset = (size - new_width) // 2
    y_offset = (size - new_height) // 2
    
    canvas.paste(img_resized, (x_offset, y_offset), img_resized)
    canvas.save(output_path, 'PNG')
    print(f"Created: {output_path}")

if __name__ == '__main__':
    # Base paths
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Phone app assets
    phone_assets = os.path.join(base_dir, 'assets', 'images')
    phone_icon = os.path.join(phone_assets, 'app-icon.png')
    
    if os.path.exists(phone_icon):
        # Create adaptive foreground for phone
        create_adaptive_foreground(
            phone_icon,
            os.path.join(phone_assets, 'adaptive-foreground.png'),
            1024
        )
        print("Phone adaptive foreground updated")
    
    # TV app assets
    tv_assets = os.path.join(base_dir, 'movieflixtv', 'assets', 'images')
    tv_icon = os.path.join(tv_assets, 'app-icon.png')
    
    if os.path.exists(tv_icon):
        # Create adaptive foreground for TV
        create_adaptive_foreground(
            tv_icon,
            os.path.join(tv_assets, 'adaptive-foreground.png'),
            1024
        )
        print("TV adaptive foreground updated")
    
    print("\nDone! The adaptive icons now have proper safe zone padding.")
    print("The icon content is scaled to fit within the inner 66% of the image.")
