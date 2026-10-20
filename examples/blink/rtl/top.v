// Nexys A7: 100 MHz clock; LED0 toggles every half second.
module top #(parameter HALF_PERIOD = 50000000)(input wire CLK100MHZ, output reg LED = 0);
    localparam WIDTH = $clog2(HALF_PERIOD) < 1 ? 1 : $clog2(HALF_PERIOD);
    reg [WIDTH-1:0] ticks = 0;
    always @(posedge CLK100MHZ) begin
        if (ticks == HALF_PERIOD-1) begin
            ticks <= 0;
            LED <= ~LED;
        end else ticks <= ticks + 1'b1;
    end
endmodule
