"use strict";

class GFXViewer {

    constructor() {

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera();
        this.camera.fov = 60; // in degs
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.near = 0.05;
        this.camera.far = 8000;
        this.camera.position.set( 0, 0.1, 2 );
        this.camera.updateProjectionMatrix();

        this.renderer = new THREE.WebGLRenderer( { alpha: true } );
        this.renderer.setClearColor( 0x3a3a3a, 1 );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        $('#gfxContainer').append( this.renderer.domElement );

        // On resize of the window, resize the renderer and adjust camera accordingly.
        $(window).resize( event => {
            this.renderer.setSize( window.innerWidth,  window.innerHeight );
            this.camera.aspect = window.innerWidth /  window.innerHeight;
            this.camera.updateProjectionMatrix();
        });

        this.renderFPS = 60;

        // For camera control with the mouse.
        this.camera.orbitControls = new THREE.OrbitControls( this.camera, this.renderer.domElement );

        // For raycaster for selection of meshes.
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.loadedMeshesInScene = [];
        this.selectedMesh = new THREE.Mesh();
        this.selectedObject = new THREE.Object3D();
        // this.selectedBoundingBox = new THREE.BoxHelper( this.selectedMesh );
        // this.scene.add( this.selectedBoundingBox );
        // this.selectedMeshes = new THREE.Group();

        // Add xyz axes and keep a reference to it.
        this.axes = this.__makeAxes( 5 );
        this.scene.add( this.axes );

        // For control of selected mesh and object.
        this.transformControls = new THREE.TransformControls( this.camera, this.renderer.domElement );
        this.transformControls.addEventListener( 'change', this.__render.bind( this ) );
        this.transformControls.setSize( 0.6 );
        this.transformControls.visible = false;
        this.scene.add( this.transformControls );

        this.textureFilePaths = { "no-texture": "no-texture-url"};
        this.loadedTextures = { "no-texture-url": new THREE.Texture() };

    }

    init_lights() {

        // let ambientLight = new THREE.AmbientLight( 0xffffff );
        // this.scene.add( ambientLight );

        let directionalLightUp = new THREE.DirectionalLight( 0xffffff, 1 );
        directionalLightUp.position.set( 0, 1, 0 );
        this.scene.add( directionalLightUp );

        let directionalLightDown = new THREE.DirectionalLight( 0xffffff, 1 );
        directionalLightDown.position.set( 0, -1, 0 );
        this.scene.add( directionalLightDown );
    }

    init_event_handlers() {

        this.listen_handle_object_uploads();
        this.listen_raycaster_for_selection();
        this.listen_bounding_box_controls();
        this.listen_transform_controls();

    }

    /* Use ajax to read the obj file as plain text, and perform some manipulations on the object. */
    listen_handle_object_uploads() {

        let self = this;

        $('#i_file').change( onAdd3DObject );

        function onAdd3DObject( event ) {

            let file = event.target.files[0];
            let filePath = window.URL.createObjectURL( file );

            $.ajax({
                url: filePath,
                contentType: "text/plain",
                mimeType: 'text/plain; charset=x-user-defined',
                success: function( fileAsString ) {

                    let loader = new THREE.OBJLoader();
                    let object = loader.parse( OBJParser.triangulateConvex( fileAsString ) );
                    object.name = file.name;
                    object.userData.filePath = filePath;
                    object.userData.simpleMeshes = OBJParser.parseToSimpleMesh( fileAsString );

                    OBJHandler.find_mesh_counts( object );
                    OBJHandler.apply_default_materials( object );
                    OBJHandler.normalize_object( object );
                    OBJHandler.compute_face_and_vertex_normals( object );
                    OBJHandler.draw_object_bounding_box( object );
                    OBJHandler.draw_mesh_bounding_boxes( object );
                    OBJHandler.recognize_meshes_for_raycaster( object, self.loadedMeshesInScene );

                    self.transformControls.attach( object );
                    self.selectedObject = object;

                    self.scene.add( object );

                    console.log("File was read and loaded into scene successfully." +
                                "\nName: " + file.name +
                                "\nSize: " + file.size + " bytes" );
                }
            });

        }

    }

    // Event listener
    listen_raycaster_for_selection() {

        let self = this;

        $('body').on( 'click dblclick' , function( event ) {

            self.mouse.x = ( event.clientX / self.renderer.domElement.clientWidth ) * 2 - 1;
            self.mouse.y = - ( event.clientY / self.renderer.domElement.clientHeight ) * 2 + 1;

            self.raycaster.setFromCamera( self.mouse, self.camera );

            let intersected = self.raycaster.intersectObjects( self.loadedMeshesInScene );

            if ( intersected.length == 0 ) {

                // self.selectedMeshes.length = 0;

            }
            else if ( intersected.length > 0 ) {

                self.transformControls.setSpace( "local" );

                // Before assigning the new selected mesh and selected object,
                // hide the old selected stuff's bounding boxes, if they exist.
                if ( self.selectedObject.userData.boundingBox ) {
                    self.selectedObject.userData.boundingBox.visible = false;
                }
                if ( self.selectedMesh.userData.boundingBox ) {
                    self.selectedMesh.userData.boundingBox.visible = false;
                }

                // Assign the new selected stuff.
                self.selectedMesh = intersected[0].object;
                self.selectedObject = self.selectedMesh.parent;

                console.log("You selected the " + self.selectedMesh.name + " mesh group of the " + self.selectedObject.name + " object.");

                // Show the new selected mesh's bounding box.
                self.selectedMesh.userData.boundingBox.visible = true;
                self.transformControls.attach( self.selectedMesh );

                // If double clicked, then focus in on the selected mesh for that cool effect.
                if ( event.ctrlKey ) {

                    self.selectedMesh.material.color.setHex( 0x999900 );
                    // self.selectedMeshes.add( self.selectedMesh );
                    // self.transformControls.attach( self.selectedMeshes );
                    // self.transformControls.update();

                }
                if ( event.type === "dblclick" ) {

                    self.camera.lookAt( self.selectedMesh.position );
                    self.camera.orbitControls.target = self.selectedMesh.position.clone();

                }

            }

        });

    }

    /* Pressing and holding the shift key temporarily reassembles the constituent meshes of an object
     * back together at the object's center. Pressing G at this time will permanently glue it back together.
     * Alternatively, one can press B */
    listen_bounding_box_controls() {

        let self = this;
        let shiftKeyUp = true; // jQuery doesn't support shift as a "keypress" event,
                               // so we make our shift keydown event behave like a keypress with this flag.

        $('body').keydown( function( event ) {

            // Fire only when the shift key is up and the shift key is being pressed.
            // Additionally, gluing back only makes sense if the object has several meshes. <--- Look into this.
            if ( shiftKeyUp && event.keyCode == 16 && self.selectedObject.userData.meshCount > 1 ) { // Shift key

                shiftKeyUp = false; // Settings this to false prevents this if-statement from running more than once.

                self.transformControls.setSpace( "world" );

                self.selectedMesh.userData.boundingBox.visible = false;
                self.selectedObject.userData.boundingBox.visible = true;
                self.transformControls.attach( self.selectedObject );

                self.selectedObject.children.forEach( function( child ) {

                    if ( child instanceof THREE.Mesh ) {

                        child.userData.oldPosition = child.position.clone();
                        child.position.copy( child.userData.geomCenter );

                    }

                });

            }

        }).keyup( function( event ) {

            // If the G key is coming back up, lift the shift key back up immediately.
            // This leaves the meshes glued back together at the object's center.
            if ( event.keyCode == 71 ) { // G key

                shiftKeyUp = true;

            }

            if ( event.keyCode == 66 ) { // B key

                self.selectedMesh.userData.boundingBox.visible = false;

                OBJHandler.recompute_object_bounding_box( self.selectedObject );

                shiftKeyUp = true;

            }

            // Fires only when the shift key is down, and is just being let go.
            if ( ! shiftKeyUp && event.keyCode == 16 ) {  // Shift key

                shiftKeyUp = true; // Reset this flag.

                self.transformControls.setSpace( "local" );

                self.selectedMesh.userData.boundingBox.visible = true;
                self.selectedObject.userData.boundingBox.visible = false;
                self.transformControls.attach( self.selectedMesh );

                self.selectedObject.children.forEach( function( child ) {

                    if ( child instanceof THREE.Mesh ) {

                        child.position.copy( child.userData.oldPosition );

                    }

                });

            }

        });

    }

    listen_transform_controls() {

        let self = this;

        $('body').keydown( function( event ) {

            switch ( event.keyCode ) {
                case 48: // 0
                    // What's the difference between local and world space?
                    self.transformControls.setSpace( self.transformControls.space === "local" ? "world" : "local" );
                    break;
                case 49: // 1
                    self.transformControls.setMode( "translate" );
                    break;
                case 50: // 2
                    self.transformControls.setMode( "rotate" );
                    break;
                case 51: // 3
                    self.transformControls.setMode( "scale" );
                    break;

                case 187: // =/+ key
                case 107: // numpad +
                    self.transformControls.setSize( self.transformControls.size + 0.1 );
                    break;
                case 189: // -/_ key
                case 109: // numpad -
                    self.transformControls.setSize( Math.max( self.transformControls.size - 0.1, 0.1 ) );
                    break;

                case 17: // CTRL key
                    // Toggle snap-to-grid for the selectedObject.
                    if ( self.transformControls.translationSnap == null && self.transformControls.rotationSnap == null) {
                        self.transformControls.setTranslationSnap( 1 );
                        self.transformControls.setRotationSnap( THREE.Math.degToRad(15) );
                    }
                    else {
                        self.transformControls.setTranslationSnap( null );
                        self.transformControls.setRotationSnap( null );
                    }

                case 72: // H
                    // Toggle visibility of selected object controls
                    self.transformControls.visible = (self.transformControls.visible ? false : true);
            }

        });


    }


    animate() {

        let self = this;
        setTimeout( function() {
            requestAnimationFrame( self.animate.bind( self ) );
        }, 1000 / self.renderFPS );

        this.__render();
        this.__update();

    }

    __render() {

        this.renderer.render( this.scene, this.camera );

    }

    __update() {

        this.transformControls.update();

        // this.camera.orbitControls.update();

    }

    __makeAxes( length ) {

    	var vertices = new Float32Array( [
    		0, 0, 0,  length, 0, 0,  // +x
    		0, 0, 0,  0, length, 0,  // +y
    		0, 0, 0,  0, 0, length,  // +z
            0, 0, 0,  -length, 0, 0, // -x
    		0, 0, 0,  0, -length, 0, // -y
    		0, 0, 0,  0, 0, -length  // -z
    	] );

    	var vertexColors = new Float32Array( [
            1, 0, 0,  1, 0.6, 0, // +x is red to kinda red.
    		0, 1, 0,  0, 1, 0.6, // +y is green to kinda green.
    		0, 0, 1,  0.6, 0, 1, // +z is blue to kinda blue.
            0, 1, 1,  0, 0.4, 1, // -x is cyan to kinda cyan.
    		1, 0, 1,  1, 0, 0.4, // -y is magenta to kinda magenta.
    		1, 1, 0,  0.4, 1, 0  // -z is yellow to kinda yellow.
    	] );

    	var geometry = new THREE.BufferGeometry();
    	geometry.addAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
    	geometry.addAttribute( 'color', new THREE.BufferAttribute( vertexColors, 3 ) );

    	var material = new THREE.LineBasicMaterial( { vertexColors: THREE.VertexColors } );

    	return new THREE.LineSegments( geometry, material );

    }

}

console.log("hello");