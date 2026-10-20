// Center: increment; down: reset. Rightmost digit, active-low segments.
module top #(parameter DEBOUNCE_CYCLES = 2000000)(
    input wire CLK100MHZ, input wire BTNC, input wire BTND,
    output wire [6:0] SEG, output wire [7:0] AN, output wire DP
);
    localparam W = $clog2(DEBOUNCE_CYCLES) < 1 ? 1 : $clog2(DEBOUNCE_CYCLES);
    (* ASYNC_REG = "TRUE" *) reg [1:0] button_sync = 0;
    (* ASYNC_REG = "TRUE" *) reg [1:0] reset_sync = 0;
    reg [W-1:0] stable_ticks = 0;
    reg pressed = 0;
    reg [3:0] count = 0;
    always @(posedge CLK100MHZ) begin
        button_sync <= {button_sync[0], BTNC};
        reset_sync <= {reset_sync[0], BTND};
        if (reset_sync[1]) begin
            count <= 0; pressed <= 0; stable_ticks <= 0;
        end else if (button_sync[1] == pressed) stable_ticks <= 0;
        else if (stable_ticks == DEBOUNCE_CYCLES-1) begin
            stable_ticks <= 0; pressed <= button_sync[1];
            if (button_sync[1]) count <= count == 9 ? 0 : count + 1'b1;
        end else stable_ticks <= stable_ticks + 1'b1;
    end
    assign AN = 8'b11111110;
    assign DP = 1'b1;
    assign SEG = count == 0 ? 7'b1000000 :
                 count == 1 ? 7'b1111001 :
                 count == 2 ? 7'b0100100 :
                 count == 3 ? 7'b0110000 :
                 count == 4 ? 7'b0011001 :
                 count == 5 ? 7'b0010010 :
                 count == 6 ? 7'b0000010 :
                 count == 7 ? 7'b1111000 :
                 count == 8 ? 7'b0000000 :
                 count == 9 ? 7'b0010000 : 7'b1111111;
endmodule
